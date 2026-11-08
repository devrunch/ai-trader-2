import { configureApp } from '../../../app.setup';
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { AppConfigSchema } from '../../../shared/config';
import { ReadinessRegistry } from '../application';
import type { ReadinessResult } from '../../../shared/health';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../shared/database';
import { RedisModule } from '../../../shared/redis';

@Module({})
class NoInfrastructureModule {}

// NFR-OB-1, NFR-RB-6, SRD §11
let app: INestApplication<Server>;
let server: Server;
let registry: ReadinessRegistry;
beforeEach(async () => {
  const config = AppConfigSchema.parse({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: 'postgres://localhost/test', REDIS_URL: 'redis://localhost' });
  const module = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
    .overrideModule(DatabaseModule).useModule(NoInfrastructureModule)
    .overrideModule(RedisModule).useModule(NoInfrastructureModule).compile();
  app = module.createNestApplication();
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
  registry = app.get(ReadinessRegistry);
});
afterEach(async () => { await app.close(); });
it('health returns ok without touching dependencies', async () => {
  const check = vi.fn(() => { throw new Error('conn refused'); });
  registry.register('fake', check);
  const response = await request(server).get('/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(check).not.toHaveBeenCalled();
});
it('ready is 503 and names the failing check', async () => {
  registry.register('fake', () => { throw new Error('conn refused'); });
  const response = await request(server).get('/ready');
  expect(response.status).toBe(503);
  expect(response.body).toEqual({ status: 'error', checks: { fake: { status: 'down', reason: 'conn refused' } } });
});
it('ready is 200 when all checks are up', async () => {
  registry.register('fake', (): Promise<ReadinessResult> => Promise.resolve({ status: 'up' }));
  const response = await request(server).get('/ready');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok', checks: { fake: { status: 'up' } } });
});
it('response carries x-request-id', async () => {
  expect((await request(server).get('/health').set('x-request-id', 'abc-123')).headers['x-request-id']).toBe('abc-123');
  expect((await request(server).get('/health')).headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
});
it('error responses carry the same request id in header and body', async () => {
  const response = await request(server).get('/missing').set('x-request-id', 'abc-123');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ code: 'NOT_FOUND', message: 'Cannot GET /missing', requestId: response.headers['x-request-id'] });
});
it('ready is 200 with no registered checks', async () => {
  const response = await request(server).get('/ready');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok', checks: {} });
});
