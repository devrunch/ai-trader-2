import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { withTimeout } from '@aitrader/resilience';
import { UnavailableError } from '../../errors';

export interface KiteSessionRecord { accessToken: string; mintedAt: Date; expiresAt: Date }
export interface LoginAttemptReservation { allowed: boolean; retryAt: Date }
export interface AutoLoginBlock { blockedUntil: Date | null; reason: string | null; attemptsToday: number }
export interface KiteSessionRepository {
  load(signal: AbortSignal): Promise<KiteSessionRecord | null>;
  save(record: KiteSessionRecord, signal: AbortSignal): Promise<void>;
  reserveLoginAttempt(now: Date, signal: AbortSignal): Promise<LoginAttemptReservation>;
  autoLoginBlock(signal: AbortSignal): Promise<AutoLoginBlock>;
  blockAutoLogin(until: Date, reason: string, signal: AbortSignal): Promise<void>;
  clearAutoLoginBlock(signal: AbortSignal): Promise<void>;
  disconnect(signal: AbortSignal): Promise<void>;
}
const rowSchema = z.object({ access_token: z.string(), minted_at: z.date(), expires_at: z.date() });
const attemptRowSchema = z.object({ login_attempts_day: z.union([z.string(), z.date()]).nullable(), login_attempts: z.number(), login_attempts_window: z.array(z.union([z.date(), z.string()])) });
export class DrizzleKiteSessionRepository implements KiteSessionRepository {
  constructor(private readonly pool: Pool) {}
  async load(signal: AbortSignal): Promise<KiteSessionRecord | null> {
    return this.query(async (client) => {
      const result = await client.query('select access_token, minted_at, expires_at from vendor_sessions where vendor = $1 and access_token is not null', ['kite']);
      if (!result.rows.length) return null;
      const row = rowSchema.parse(result.rows[0]);
      return { accessToken: row.access_token, mintedAt: row.minted_at, expiresAt: row.expires_at };
    }, signal);
  }
  async save(record: KiteSessionRecord, signal: AbortSignal): Promise<void> {
    await this.query(async (client) => {
      // The vendor primary key makes repeated refresh deliveries an idempotent upsert.
      await client.query(`insert into vendor_sessions (vendor, access_token, minted_at, expires_at) values ($1, $2, $3, $4)
        on conflict (vendor) do update set access_token = excluded.access_token,
        minted_at = excluded.minted_at, expires_at = excluded.expires_at`,
      ['kite', record.accessToken, record.mintedAt, record.expiresAt]);
    }, signal);
  }
  async reserveLoginAttempt(now: Date, signal: AbortSignal): Promise<LoginAttemptReservation> {
    return this.query(async client => {
      await client.query('begin');
      try {
        await client.query("select pg_advisory_xact_lock(hashtext('kite-login-attempts'))");
        const result = await client.query(`select login_attempts_day, login_attempts, login_attempts_window
          from vendor_sessions where vendor = 'kite' for update`);
        const row = result.rows[0] === undefined ? undefined : attemptRowSchema.parse(result.rows[0]);
        const istDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
        const storedDay = row?.login_attempts_day instanceof Date
          ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(row.login_attempts_day) : row?.login_attempts_day;
        const dayAttempts = storedDay === istDay ? row?.login_attempts ?? 0 : 0;
        const window = (row?.login_attempts_window ?? []).map(value => new Date(value)).filter(value => now.getTime() - value.getTime() < 900000);
        const dailyRetry = new Date(new Date(`${istDay}T00:00:00+05:30`).getTime() + 86400000);
        const retryAt = dayAttempts >= 6 ? dailyRetry : window.length >= 3
          ? new Date((window[0]?.getTime() ?? now.getTime()) + 900000) : new Date(now.getTime() + 900000);
        if (dayAttempts >= 6 || window.length >= 3) {
          await client.query('commit');
          return { allowed: false, retryAt };
        }
        window.push(now);
        await client.query(`insert into vendor_sessions (vendor, login_attempts_day, login_attempts, login_attempts_window)
          values ('kite', $1::date, $2, $3::timestamptz[])
          on conflict (vendor) do update set login_attempts_day = excluded.login_attempts_day,
          login_attempts = excluded.login_attempts, login_attempts_window = excluded.login_attempts_window`,
        [istDay, dayAttempts + 1, window.map(value => value.toISOString())]);
        await client.query('commit');
        return { allowed: true, retryAt };
      } catch (error) { await client.query('rollback'); throw error; }
    }, signal);
  }
  async autoLoginBlock(signal: AbortSignal): Promise<AutoLoginBlock> {
    return this.query(async client => {
      const result = await client.query(`select auto_login_blocked_until, auto_login_block_reason,
        case when login_attempts_day = (now() at time zone 'Asia/Kolkata')::date then login_attempts else 0 end as login_attempts
        from vendor_sessions where vendor = 'kite'`);
      const row: unknown = result.rows[0];
      if (!row) return { blockedUntil: null, reason: null, attemptsToday: 0 };
      const parsed = z.object({ auto_login_blocked_until: z.date().nullable(), auto_login_block_reason: z.string().nullable(), login_attempts: z.number() }).parse(row);
      return { blockedUntil: parsed.auto_login_blocked_until, reason: parsed.auto_login_block_reason, attemptsToday: parsed.login_attempts };
    }, signal);
  }
  async blockAutoLogin(until: Date, reason: string, signal: AbortSignal): Promise<void> {
    await this.query(async client => { await client.query(`insert into vendor_sessions (vendor, auto_login_blocked_until, auto_login_block_reason) values ('kite', $1, $2)
      on conflict (vendor) do update set auto_login_blocked_until = excluded.auto_login_blocked_until, auto_login_block_reason = excluded.auto_login_block_reason`, [until, reason]); }, signal);
  }
  async clearAutoLoginBlock(signal: AbortSignal): Promise<void> {
    await this.query(async client => { await client.query(`update vendor_sessions set auto_login_blocked_until = null, auto_login_block_reason = null where vendor = 'kite'`, []); }, signal);
  }
  async disconnect(signal: AbortSignal): Promise<void> {
    await this.query(async client => { await client.query(`update vendor_sessions set access_token = null, minted_at = null, expires_at = null where vendor = 'kite'`, []); }, signal);
  }
  private async query<T>(action: (client: PoolClient) => Promise<T>, parent: AbortSignal): Promise<T> {
    try {
      return await withTimeout(async (signal) => {
        const client = await this.pool.connect();
        if (signal.aborted) { client.release(true); throw new Error('aborted'); }
        let released = false;
        const release = () => { if (!released) { released = true; client.release(signal.aborted); } };
        signal.addEventListener('abort', release, { once: true });
        try { return await action(client); }
        finally { signal.removeEventListener('abort', release); release(); }
      }, 1500, parent);
    } catch { throw new UnavailableError('Kite session storage unavailable'); }
  }
}
