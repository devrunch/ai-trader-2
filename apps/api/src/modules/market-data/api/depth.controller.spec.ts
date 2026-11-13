import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DepthResponseSchema } from '@aitrader/contracts';
import { configureApp } from '../../../app.setup';
import { GlobalExceptionFilter, SymbolNotFoundError } from '../../../shared/errors';
import { IpRateLimitGuard } from '../../../shared/http/ip-rate-limit.guard';
import { SessionGuard } from '../../auth/api/index';
import { ResolveInstrument } from '../../instruments/application/index';
import { ReadDepth } from '../application/read-depth';
import { DepthController } from './depth.controller';

// FR-MD-2 order book endpoint
let app: INestApplication<Server>;
let allowed = true;
const execute = vi.fn<ReadDepth['execute']>();
beforeEach(async () => {
  allowed = true;
  execute.mockReset().mockResolvedValue({ depth: null, unavailable: 'Market closed' });
  const module = await Test.createTestingModule({ controllers: [DepthController], providers: [
    { provide: IpRateLimitGuard, useValue: new IpRateLimitGuard(60, 20, () => 0) }, GlobalExceptionFilter,
    { provide: PinoLogger, useValue: new PinoLogger({ pinoHttp: { level: 'silent' } }) },
    { provide: ReadDepth, useValue: { execute } },
    { provide: ResolveInstrument, useValue: { execute: (id: string) => id === 'NSE:NOPE' ? Promise.reject(new SymbolNotFoundError(id))
      : Promise.resolve({ instrument: { id: { toString: () => id === 'RELIANCE' ? 'NSE:RELIANCE' : id } } }) } },
  ] }).overrideGuard(SessionGuard).useValue({ canActivate: () => allowed }).compile();
  app = module.createNestApplication(); configureApp(app); await app.init();
});
afterEach(async () => { await app.close(); });

it('returns the depth response for the resolved canonical id', async () => {
  const response = { depth: null, unavailable: 'Market closed' };
  const res = await request(app.getHttpServer()).get('/api/v1/depth/RELIANCE').expect(200);
  expect(DepthResponseSchema.parse(res.body)).toEqual(response);
  expect(execute).toHaveBeenCalledWith('NSE:RELIANCE');
});
it('answers 404 for an unknown instrument without reading depth', async () => {
  await request(app.getHttpServer()).get('/api/v1/depth/NSE:NOPE').expect(404);
  expect(execute).not.toHaveBeenCalled();
});
it('rejects a too-short id with 422', async () => {
  await request(app.getHttpServer()).get('/api/v1/depth/ab').expect(422);
});
it('is refused without a session', async () => {
  allowed = false;
  await request(app.getHttpServer()).get('/api/v1/depth/NSE:TEST').expect(403);
  expect(execute).not.toHaveBeenCalled();
});
