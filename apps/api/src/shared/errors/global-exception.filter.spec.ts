import { configureApp } from '../../app.setup';
import 'reflect-metadata';
import { Controller, Get, HttpException, Param } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ErrorBodySchema } from '@aitrader/contracts';
import request from 'supertest';
import type { Server } from 'node:http';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DomainError, ConflictError, NotFoundError, RateLimitedError, UnavailableError, ValidationError, GlobalExceptionFilter } from './index';

@Controller()
class ThrowController {
  @Get('throw/:kind')
  fail(@Param('kind') kind: string): never {
    switch (kind) {
      case 'domain': throw new NotFoundError('Order not found', { id: '7' });
      case 'zod': z.object({ qty: z.number() }).parse({ qty: 'bad' }); break;
      case 'rate': throw new RateLimitedError('Slow down', 1500);
      // These deliberate invalid throws verify the NFR-SC-1 boundary.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      case 'string': throw 'boom';
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      case 'undefined': throw undefined;
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      case 'object': throw {};
      case 'validation': throw new ValidationError('Invalid');
      case 'conflict': throw new ConflictError('Conflict');
      case 'unavailable': throw new UnavailableError('Unavailable');
      default:
        if (kind.startsWith('http')) throw new HttpException('SELECT secret', Number(kind.slice(4)));
    }
    throw new Error('SELECT * FROM secrets');
  }
}

// SRD §11; NFR-SC-1: exact public errors, no unknown-error leaks.
let app: INestApplication<Server>;
let server: Server;
const bodies: unknown[] = [];
beforeAll(async () => {
  vi.spyOn(PinoLogger.prototype, 'warn').mockImplementation(() => undefined);
  vi.spyOn(PinoLogger.prototype, 'error').mockImplementation(() => undefined);
  const module = await Test.createTestingModule({ controllers: [ThrowController], providers: [GlobalExceptionFilter, { provide: PinoLogger, useValue: new PinoLogger({ pinoHttp: { level: 'silent' } }) }] }).compile();
  app = module.createNestApplication();
  configureApp(app);
  app.use((req: { id?: string; headers: Record<string, unknown> }, _res: unknown, next: () => void) => {
    const header = req.headers['x-request-id'];
    if (typeof header === 'string') req.id = header;
    next();
  });
  await app.init();
  server = app.getHttpServer();
});
afterAll(async () => { await app.close(); vi.restoreAllMocks(); });
async function get(path: string, requestId?: string) {
  const call = request(server).get('/api' + path);
  if (requestId) call.set('x-request-id', requestId);
  const response = await call;
  bodies.push(response.body);
  return { response, body: ErrorBodySchema.parse(response.body) };
}
it('maps DomainError to its status and code', async () => {
  expect(new NotFoundError('Missing')).toBeInstanceOf(DomainError);
  const { response, body } = await get('/throw/domain');
  expect(response.status).toBe(404);
  expect(body).toEqual({ code: 'NOT_FOUND', message: 'Order not found', details: { id: '7' }, requestId: 'unknown' });
  for (const [kind, status, code] of [['validation', 422, 'VALIDATION_FAILED'], ['conflict', 409, 'CONFLICT'], ['unavailable', 503, 'UNAVAILABLE']] as const) {
    const result = await get(`/throw/${kind}`);
    expect(result.response.status).toBe(status);
    expect(result.body.code).toBe(code);
  }
});
it('maps Zod validation failures to 422 VALIDATION_FAILED with field details', async () => {
  const { response, body } = await get('/throw/zod');
  expect(response.status).toBe(422);
  expect(body.code).toBe('VALIDATION_FAILED');
  const fields = z.array(z.object({ path: z.string(), message: z.string() })).parse(body.details?.fields);
  expect(fields[0]?.path).toBe('qty');
  expect(fields[0]?.message.length).toBeGreaterThan(0);
});
it('maps Nest HttpException 404 to NOT_FOUND', async () => {
  expect((await get('/missing')).body.code).toBe('NOT_FOUND');
  for (const [status, code] of [[400, 'VALIDATION_FAILED'], [422, 'VALIDATION_FAILED'], [401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [409, 'CONFLICT'], [429, 'RATE_LIMITED'], [503, 'UNAVAILABLE'], [502, 'INTERNAL']] as const) {
    const result = await get(`/throw/http${String(status)}`);
    expect(result.response.status).toBe(status);
    expect(result.body.code).toBe(code);
    expect(result.body.message).toBe(status >= 500 ? 'Internal error' : 'SELECT secret');
  }
});
it('maps unknown Error to 500 INTERNAL without stack or message leak', async () => {
  const { response, body } = await get('/throw/error');
  expect(response.status).toBe(500);
  expect(body).toEqual({ code: 'INTERNAL', message: 'Internal error', requestId: 'unknown' });
  expect(response.text).not.toMatch(/SELECT|at /);
});
it('filter maps thrown non-Error values to INTERNAL', async () => {
  for (const kind of ['string', 'undefined', 'object']) {
    const { response, body } = await get(`/throw/${kind}`);
    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL');
  }
});
it('always includes requestId', async () => {
  expect((await get('/throw/domain', 'abc-123')).body.requestId).toBe('abc-123');
  expect((await get('/throw/domain')).body.requestId).toBe('unknown');
});
it('sets Retry-After for RateLimitedError(1500)', async () => {
  const { response } = await get('/throw/rate');
  expect(response.status).toBe(429);
  expect(response.headers['retry-after']).toBe('2');
});
it('every response body satisfies ErrorBodySchema', () => {
  expect(bodies.length).toBeGreaterThan(10);
  for (const body of bodies) expect(ErrorBodySchema.safeParse(body).success).toBe(true);
});
