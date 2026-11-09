import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/shared/database/schema/index.js';
import { CreateAdmin } from '../src/modules/auth/application/create-admin.js';
import { DrizzleUserRepository } from '../src/modules/auth/infrastructure/drizzle-user.repository.js';
import { Argon2Hasher } from '../src/modules/auth/infrastructure/argon2-hasher.js';
import { RedisSessionStore } from '../src/modules/auth/infrastructure/redis-session.store.js';
import { startPostgres, startRedis } from './support/containers.js';
import { NestFactory } from '@nestjs/core';
import { AppConfigSchema } from '../src/shared/config/index.js';
import { AdminCliModule } from '../src/cli/admin-cli.module.js';
import { JobScheduler } from '../src/shared/jobs/job-scheduler.js';

describe('auth integration FR-AC-1 NFR-SC-1 NFR-SC-5', () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>> | undefined;
  let redisContainer: Awaited<ReturnType<typeof startRedis>> | undefined;
  let pool: Pool | undefined; let redis: Redis | undefined; let users: DrizzleUserRepository | undefined; let sessions: RedisSessionStore | undefined;
  beforeAll(async () => {
    postgres = await startPostgres(); redisContainer = await startRedis();
    pool = new Pool({ connectionString: postgres.url }); redis = new Redis(redisContainer.url);
    await pool.query('CREATE EXTENSION IF NOT EXISTS citext; CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username citext NOT NULL UNIQUE, password_hash text NOT NULL, role text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), disabled boolean NOT NULL DEFAULT false, failed_logins integer NOT NULL DEFAULT 0, locked_until timestamptz);');
    users = new DrizzleUserRepository(drizzle(pool, { schema })); sessions = new RedisSessionStore(redis);
  });
  afterAll(async () => { redis?.disconnect(); await pool?.end(); await redisContainer?.stop(); await postgres?.stop(); });
  it('admin:create creates then resets an admin through the use case', async () => {
    if (!users) throw new Error('Postgres repository is unavailable');
    const createAdmin = new CreateAdmin(users, new Argon2Hasher());
    await createAdmin.execute('Owner_Admin', 'long-password-value-one');
    const first = await users.findByUsername('owner_admin');
    await createAdmin.execute('owner_admin', 'long-password-value-two');
    const reset = await users.findByUsername('owner_admin');
    expect(first?.role).toBe('admin'); expect(reset?.role).toBe('admin');
    expect(reset?.passwordHash).not.toBe(first?.passwordHash); expect(reset?.failedLogins).toBe(0);
  });
  it('sessions expire after the TTL', async () => {
    if (!sessions || !redis) throw new Error('Redis session store is unavailable');
    const id = await sessions.create({ userId: '00000000-0000-4000-8000-000000000001', role: 'user', createdAt: new Date().toISOString() });
    expect(await redis.ttl(`session:${id}`)).toBe(43200);
    await redis.expire(`session:${id}`, 1); await new Promise(resolve => setTimeout(resolve, 1100));
    expect(await sessions.get(id)).toBeNull();
  });
  it('admin cli module boots without scheduler, kite or redis and creates an admin', async () => {
    if (!postgres || !pool) throw new Error('Postgres container is unavailable');
    const config = AppConfigSchema.parse({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: postgres.url, REDIS_URL: 'redis://127.0.0.1:6379' });
    const app = await NestFactory.createApplicationContext(AdminCliModule.forRoot(config), { logger: false });
    try {
      expect(() => app.get(JobScheduler, { strict: false })).toThrow();
      await app.get(CreateAdmin).execute('cli_owner', 'cli-owner-password');
      const row = await pool.query('SELECT username, role FROM users WHERE username = $1', ['cli_owner']);
      expect(row.rows).toEqual([{ username: 'cli_owner', role: 'admin' }]);
    } finally { await app.close(); }
  });
});
