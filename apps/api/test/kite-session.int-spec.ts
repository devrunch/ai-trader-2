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
  it('stores and reloads the token across service instances', async () => {
    const repository = new DrizzleKiteSessionRepository(pool);
    const login = vi.fn(() => Promise.resolve({ requestToken: 'request' }));
    const exchange = { generateSession: vi.fn(() => Promise.resolve({ access_token: 'persisted' })) };
    const now = () => Date.parse('2026-11-08T01:00:00Z');
    const logger = { log: vi.fn() };
    const first = new KiteSessionService(credentials, repository, login, exchange, now, logger);
    await expect(first.getAccessToken()).resolves.toBe('persisted');
    const second = new KiteSessionService(credentials, repository, login, exchange, now, logger);
    await expect(second.getAccessToken()).resolves.toBe('persisted');
    expect(login).toHaveBeenCalledTimes(1);
    expect((await second.status()).expiresAt).toBe('2026-11-09T00:30:00.000Z');
  });
  it('registers the refresh job only when credentials exist', async () => {
    const scheduler = { register: vi.fn(() => Promise.resolve()) };
    const service = new KiteSessionService(credentials, new DrizzleKiteSessionRepository(pool), vi.fn(), { generateSession: vi.fn() });
    const readiness = new ReadinessRegistry();
    await new KiteRegistration(null, service, scheduler, readiness).onModuleInit();
    expect(scheduler.register).not.toHaveBeenCalled();
    await new KiteRegistration(credentials, service, scheduler, new ReadinessRegistry()).onModuleInit();
    expect(scheduler.register).toHaveBeenCalledWith(expect.objectContaining({ name: 'kite-session-refresh', cron: '20 6 * * *', tz: 'Asia/Kolkata', graceMs: 21600000, maxRuntimeMs: 120000 }));
  });
});
