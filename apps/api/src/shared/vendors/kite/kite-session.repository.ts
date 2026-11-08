import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { withTimeout } from '@aitrader/resilience';
import { UnavailableError } from '../../errors';

export interface KiteSessionRecord { accessToken: string; mintedAt: Date; expiresAt: Date }
export interface KiteSessionRepository {
  load(signal: AbortSignal): Promise<KiteSessionRecord | null>;
  save(record: KiteSessionRecord, signal: AbortSignal): Promise<void>;
}
const rowSchema = z.object({ access_token: z.string(), minted_at: z.date(), expires_at: z.date() });
export class DrizzleKiteSessionRepository implements KiteSessionRepository {
  constructor(private readonly pool: Pool) {}
  async load(signal: AbortSignal): Promise<KiteSessionRecord | null> {
    return this.query(async (client) => {
      const result = await client.query('select access_token, minted_at, expires_at from vendor_sessions where vendor = $1', ['kite']);
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
