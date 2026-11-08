import { configureApp } from '../src/app.setup';
import 'reflect-metadata';
import { setTimeout as delay } from 'node:timers/promises';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { loadConfig } from '../src/shared/config';
import { DB, type Database } from '../src/shared/database';
import { REDIS } from '../src/shared/redis';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { startPostgres, startRedis, withToxiproxy } from './support/containers';

// NFR-RB-1/3/6/7, E17 and E18: real dependency failures with stable proxy addresses.
describe('Postgres and Redis infrastructure', () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>> | undefined;
  let redis: Awaited<ReturnType<typeof startRedis>> | undefined;
  let databaseProxy: Awaited<ReturnType<typeof withToxiproxy>>;
  let redisProxy: Awaited<ReturnType<typeof withToxiproxy>>;
  const cleanup: (() => Promise<void>)[] = [];
  let app: INestApplication<Server> | undefined;

  async function boot() {
    const module = await Test.createTestingModule({ imports: [AppModule.forRoot(loadConfig({
      NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: databaseProxy.url, REDIS_URL: redisProxy.url,
    }))] }).compile();
    app = module.createNestApplication<INestApplication<Server>>();
    configureApp(app);
    await app.init();
    return app;
  }

  function http() {
    if (!app) throw new Error('App is not running');
    return request(app.getHttpServer());
  }

  async function ready() {
    await expect.poll(async () => (await http().get('/ready')).status, { timeout: 15_000, interval: 100 }).toBe(200);
  }

  beforeAll(async () => {
    postgres = await startPostgres();
    cleanup.unshift(postgres.stop);
    redis = await startRedis();
    cleanup.unshift(redis.stop);
    databaseProxy = await withToxiproxy(postgres);
    cleanup.unshift(databaseProxy.stop);
    redisProxy = await withToxiproxy(redis);
    cleanup.unshift(redisProxy.stop);
  });
  beforeEach(async () => { await databaseProxy.restore(); await redisProxy.restore(); });
  afterEach(async () => { await app?.close(); app = undefined; });
  afterAll(async () => {
    for (const stop of cleanup) await stop();
  });

  it('ready is ok when postgres and redis are up', async () => {
    await boot(); await ready();
    const response = await http().get('/ready').expect(200);
    expect(response.body).toEqual({ status: 'ok', checks: { database: { status: 'up' }, redis: { status: 'up' } } });
  });

  async function outage(name: 'redis' | 'database') {
    await boot(); await ready();
    const proxy = name === 'redis' ? redisProxy : databaseProxy;
    await proxy.cut();
    const start = Date.now();
    const response = await http().get('/ready').expect(503);
    expect(Date.now() - start).toBeLessThan(3000);
    expect(response.body).toMatchObject({ checks: {
      [name]: { status: 'down' },
      [name === 'redis' ? 'database' : 'redis']: { status: 'up' },
    } });
    expect(z.object({ checks: z.record(z.string(), z.object({ reason: z.string().optional() })) })
      .parse(response.body).checks[name]?.reason).toBeTruthy();
    await http().get('/health').expect(200);
    await proxy.restore(); await ready();
  }
  it('ready reports redis down and recovers', async () => { await outage('redis'); });
  it('ready reports postgres down and recovers', async () => { await outage('database'); });

  async function bootDown(name: 'redis' | 'database') {
    await (name === 'redis' ? redisProxy : databaseProxy).cut();
    await boot();
    await http().get('/health').expect(200);
    const response = await http().get('/ready').expect(503);
    expect(response.body).toMatchObject({ checks: { [name]: { status: 'down' } } });
  }
  it('app boots while redis is down', async () => { await bootDown('redis'); });
  it('app boots while postgres is down', async () => { await bootDown('database'); });

  it('a query error does not crash the process', async () => {
    const running = await boot(); await ready();
    const query = running.get<Database>(DB).execute(sql`select pg_sleep(4)`);
    const rejected = expect(Promise.resolve(query)).rejects.toThrow();
    await delay(100); await databaseProxy.cut(); await rejected;
    await http().get('/health').expect(200);
  });

  it('shuts down cleanly', async () => {
    const running = await boot(); await ready();
    const database = running.get<Database>(DB);
    const client = running.get<Redis>(REDIS);
    const start = Date.now();
    await running.close(); app = undefined;
    expect(Date.now() - start).toBeLessThan(5000);
    expect(client.status).toBe('end');
    await expect(database.execute(sql`select 1`)).rejects.toThrow();
  });
});
