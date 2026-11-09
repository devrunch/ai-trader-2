import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { loadConfig } from '../src/shared/config';
import { startPostgres, startRedis } from './support/containers';

// The real AppModule, nothing overridden: every provider in the dependency graph must resolve.
let postgres: Awaited<ReturnType<typeof startPostgres>>;
let redis: Awaited<ReturnType<typeof startRedis>>;
beforeAll(async () => { [postgres, redis] = await Promise.all([startPostgres(), startRedis()]); }, 120_000);
afterAll(async () => { await Promise.all([postgres.stop(), redis.stop()]); });

it('compiles the unmodified AppModule dependency graph', async () => {
  const module = await Test.createTestingModule({ imports: [AppModule.forRoot(loadConfig({
    NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: postgres.url, REDIS_URL: redis.url,
  }))] }).compile();
  expect(module).toBeDefined();
  await module.close();
}, 60_000);
