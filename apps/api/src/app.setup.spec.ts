import 'reflect-metadata';
import { Controller, Get, Req, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { ErrorBodySchema } from '@aitrader/contracts';
import { GlobalExceptionFilter } from './shared/errors';
import { configureApp, parseTrustProxy } from './app.setup';

@Controller()
class IpController {
  @Get('ip')
  ip(@Req() req: { ip: string }) { return req.ip; }
}

@Controller()
class HealthController {
  @Get('health')
  health() { return { status: 'ok' }; }
}

// NFR-SC, NFR-QL: exercise the shared production setup with silent logging.
let app: INestApplication<Server>;
const compile = () => Test.createTestingModule({
  controllers: [HealthController, IpController],
  providers: [GlobalExceptionFilter, { provide: PinoLogger, useValue: new PinoLogger({ pinoHttp: { level: 'silent' } }) }],
}).compile();
beforeAll(async () => {
  app = (await compile()).createNestApplication();
  configureApp(app);
  await app.init();
});
afterAll(async () => { await app.close(); });

it('configureApp removes x-powered-by', async () => {
  const response = await request(app.getHttpServer()).get('/health').expect(200);
  expect(response.headers['x-powered-by']).toBeUndefined();
});

it('configureApp maps errors through the global filter', async () => {
  const response = await request(app.getHttpServer()).get('/api/missing').expect(404);
  const body = ErrorBodySchema.parse(response.body);
  expect(body.code).toBe('NOT_FOUND');
  expect(body.requestId).toBeTruthy();
});

it('parseTrustProxy turns digits into a hop count and keeps keywords and CIDRs', () => {
  expect(parseTrustProxy('1')).toBe(1);
  expect(parseTrustProxy('loopback')).toBe('loopback');
  expect(parseTrustProxy('10.0.0.0/8, loopback')).toBe('10.0.0.0/8, loopback');
});

it('configureApp trusts the configured proxy for client addresses', async () => {
  const proxied = (await compile()).createNestApplication<INestApplication<Server>>();
  configureApp(proxied, '1');
  await proxied.init();
  const response = await request(proxied.getHttpServer()).get('/api/ip').set('X-Forwarded-For', '203.0.113.9').expect(200);
  expect(response.text).toBe('203.0.113.9');
  await proxied.close();
});

it('configureApp ignores X-Forwarded-For from hops outside the trusted set', async () => {
  const other = (await compile()).createNestApplication<INestApplication<Server>>();
  configureApp(other, '10.0.0.0/8');
  await other.init();
  const response = await request(other.getHttpServer()).get('/api/ip').set('X-Forwarded-For', '203.0.113.9');
  expect(response.text).not.toBe('203.0.113.9');
  await other.close();
});
