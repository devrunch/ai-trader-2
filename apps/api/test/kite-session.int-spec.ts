import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { startPostgres } from './support/containers';
import { DrizzleKiteSessionRepository } from '../src/shared/vendors/kite/kite-session.repository';
import { KiteSessionService } from '../src/shared/vendors/kite/kite-session.service';
import { KiteRegistration } from '../src/shared/vendors/kite/kite.module';
import { ReadinessRegistry } from '../src/shared/health';
import { z } from 'zod';

// FR-MD-3, NFR-RB-5: Postgres durability and scheduler registration.
describe('Kite durable session', () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  beforeAll(async () => {
    postgres = await startPostgres();
    pool = new Pool({ connectionString: postgres.url, connectionTimeoutMillis: 3000, options: '-c statement_timeout=5000' });
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  });
  afterAll(async () => { await pool.end(); await postgres.stop(); });
  const credentials = { apiKey: 'key', apiSecret: 'secret', userId: 'user', password: 'password', totpSecret: 'totp' };
  it('caps logins at 3 per 15 minutes and 6 per day across restarts', async () => {
    const repository = new DrizzleKiteSessionRepository(pool);
    await pool.query("delete from vendor_sessions where vendor = 'kite'");
    let now = Date.parse('2026-11-09T01:00:00Z');
    const login = vi.fn(() => Promise.reject(new Error('simulated vendor rejection')));
    const makeService = () => new KiteSessionService(credentials, repository, login,
      { generateSession: vi.fn(() => Promise.resolve({ access_token: 'unused', user_id: 'user' })) }, () => now, { log: vi.fn(), warn: vi.fn() }, true);
    const first = makeService();
    for (let i = 0; i < 3; i++) await expect(first.getAccessToken()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(first.getAccessToken()).rejects.toMatchObject({ details: { reason: 'login attempts exhausted', retryAt: '2026-11-09T01:15:00.000Z' } });
    now += 16 * 60000;
    const restarted = makeService();
    for (let i = 0; i < 3; i++) await expect(restarted.getAccessToken()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(restarted.getAccessToken()).rejects.toMatchObject({ details: { reason: 'login attempts exhausted', retryAt: '2026-11-09T18:30:00.000Z' } });
    expect(login).toHaveBeenCalledTimes(6);
    const query = await pool.query("select login_attempts_day, login_attempts from vendor_sessions where vendor = 'kite'");
    const row = z.object({ login_attempts_day: z.date(), login_attempts: z.number() }).parse(query.rows[0]);
    expect(row.login_attempts).toBe(6);
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(row.login_attempts_day)).toBe('2026-11-09');
  });
  it('stores and reloads the token across service instances', async () => {
    await pool.query("delete from vendor_sessions where vendor = 'kite'");
    const repository = new DrizzleKiteSessionRepository(pool);
    const login = vi.fn(() => Promise.resolve({ requestToken: 'request' }));
    const exchange = { generateSession: vi.fn(() => Promise.resolve({ access_token: 'persisted', user_id: 'user' })) };
    const now = () => Date.parse('2026-11-08T01:00:00Z');
    const logger = { log: vi.fn(), warn: vi.fn() };
    const first = new KiteSessionService(credentials, repository, login, exchange, now, logger, true);
    await expect(first.getAccessToken()).resolves.toBe('persisted');
    const second = new KiteSessionService(credentials, repository, login, exchange, now, logger, true);
    await expect(second.getAccessToken()).resolves.toBe('persisted');
    expect(login).toHaveBeenCalledTimes(1);
    expect((await second.status()).expiresAt).toBe('2026-11-09T00:30:00.000Z');
  });
  it('persists CAPTCHA lock for 24 hours and prevents scripted login after restart', async () => {
    await pool.query("delete from vendor_sessions where vendor = 'kite'");
    const repository = new DrizzleKiteSessionRepository(pool);
    const now = Date.parse('2026-11-09T01:00:00Z');
    await repository.blockAutoLogin(new Date(now + 86400000), 'CAPTCHA_REQUIRED', AbortSignal.timeout(3000));
    const login = vi.fn(() => Promise.resolve({ requestToken: 'should-not-run' }));
    const service = new KiteSessionService(credentials, repository, login,
      { generateSession: vi.fn(() => Promise.resolve({ access_token: 'unused', user_id: 'user' })) }, () => now, { log: vi.fn(), warn: vi.fn() }, true);
    await expect(service.getAccessToken()).rejects.toMatchObject({ details: { reason: 'CAPTCHA_REQUIRED', action: 'connect_zerodha' } });
    expect(login).not.toHaveBeenCalled();
  });
  it('round-trips the last login failure and clears it on a successful save', async () => {
    await pool.query("delete from vendor_sessions where vendor = 'kite'");
    const repository = new DrizzleKiteSessionRepository(pool);
    const signal = new AbortController().signal;
    await expect(repository.lastLoginFailure(signal)).resolves.toBeNull();
    const failure = { stage: 'twofa' as const, message: 'twofa failed: HTTP 403', httpStatus: 403, at: new Date('2026-11-12T03:15:00.000Z') };
    await repository.recordLoginFailure(failure, signal);
    await expect(repository.lastLoginFailure(signal)).resolves.toEqual(failure);
    await repository.save({ accessToken: 't', mintedAt: new Date('2026-11-12T03:20:00.000Z'), expiresAt: new Date('2026-11-13T00:30:00.000Z') }, signal);
    await expect(repository.lastLoginFailure(signal)).resolves.toBeNull();
  });
  it('registers the refresh job only when credentials exist', async () => {
    const scheduler = { register: vi.fn(() => Promise.resolve()) };
    const service = new KiteSessionService(credentials, new DrizzleKiteSessionRepository(pool), vi.fn(),
      { generateSession: vi.fn(() => Promise.resolve({ access_token: 'unused', user_id: 'user' })) });
    const readiness = new ReadinessRegistry();
    await new KiteRegistration(null, service, scheduler, readiness, true).onModuleInit();
    expect(scheduler.register).not.toHaveBeenCalled();
    await new KiteRegistration(credentials, service, scheduler, new ReadinessRegistry(), false).onModuleInit();
    expect(scheduler.register).not.toHaveBeenCalled();
    await new KiteRegistration(credentials, service, scheduler, new ReadinessRegistry(), true).onModuleInit();
    expect(scheduler.register).toHaveBeenCalledWith(expect.objectContaining({ name: 'kite-session-refresh', cron: '20 6 * * *', tz: 'Asia/Kolkata', graceMs: 21600000, maxRuntimeMs: 120000 }));
  });
});
