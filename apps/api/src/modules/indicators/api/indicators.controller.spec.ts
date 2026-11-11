import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IndicatorDefinitionSchema, IndicatorDetailResponseSchema, IndicatorListResponseSchema, IndicatorResultSchema, type BarsResponse } from '@aitrader/contracts';
import { configureApp } from '../../../app.setup';
import { GlobalExceptionFilter, ValidationError } from '../../../shared/errors';
import { IpRateLimitGuard } from '../../../shared/http';
import { IndicatorService, RuntimeResolver } from '../application';
import type { IndicatorRuntime } from '../application/ports/indicator-runtime';
import type { ScriptInspector } from '../application/ports/script-inspector';
import { IndicatorsController } from './indicators.controller';
import { INDICATORS_RATE_LIMIT } from './indicators-rate-limit.guard';

/** Plots each bar's close; the controller only maps DTOs. */
const closeRuntime: IndicatorRuntime = { name: 'close', supports: program => program.kind === 'builtin',
  create: () => ({ seed: input => Promise.resolve(input.map(b => ({ ma: b.close }))), update: b => Promise.resolve({ ma: b.close }), close: () => undefined }) };

/** Describes any script with `indicator(` as one length input; anything else is an unsupported feature at line 1. */
const inspector: ScriptInspector = { inspect: source => source.includes('indicator(')
  ? Promise.resolve({ ref: 'pine:0123456789ab@1', id: 'pine0123456789ab', version: 1, name: 'x', shortName: 'x', overlay: false,
    inputs: [{ id: 'length', title: 'Length', type: 'int', default: 14 }], plots: [{ id: 'plot', title: 'Plot', kind: 'line', color: 'blue', lineWidth: 1 }], levels: [] })
  : Promise.reject(new ValidationError('Unsupported Pine feature "strategy()" at line 1', { reason: 'UNSUPPORTED', feature: 'strategy()', line: 1 })) };

// FR-IN-31, SRD §11
let app: INestApplication<Server>;
const bars = vi.fn<(symbol: string, interval: BarsResponse['interval'], cursor: unknown, limit: number) => Promise<BarsResponse>>();
const closes = Array.from({ length: 40 }, (_, i) => ({ time: i * 60_000, open: 10 + i, high: 11 + i, low: 9 + i, close: 10 + i, volume: 100 }));
beforeEach(async () => {
  bars.mockReset().mockImplementation((symbol, interval, _cursor, limit) =>
    Promise.resolve({ instrumentId: symbol, resolvedId: symbol, interval, bars: closes.slice(-limit), nextBefore: null, status: { state: 'ok' } }));
  const service = new IndicatorService({ bars }, new RuntimeResolver([closeRuntime]), () => 'UTC', inspector);
  const module = await Test.createTestingModule({ controllers: [IndicatorsController], providers: [
    { provide: INDICATORS_RATE_LIMIT, useValue: new IpRateLimitGuard(30, 10, () => 0) }, GlobalExceptionFilter,
    { provide: PinoLogger, useValue: new PinoLogger({ pinoHttp: { level: 'silent' } }) },
    { provide: IndicatorService, useValue: service },
  ] }).compile();
  app = module.createNestApplication(); configureApp(app); await app.init();
});
afterEach(async () => { await app.close(); });
const compute = (body: object) => request(app.getHttpServer()).post('/api/v1/indicators/compute').send(body);

it('lists the built-in definitions', async () => {
  const response = await request(app.getHttpServer()).get('/api/v1/indicators').expect(200);
  const body = IndicatorListResponseSchema.parse(response.body);
  expect(body.indicators.map(d => d.ref)).toContain('builtin:supertrend@1');
});

it('returns one definition with its Pine source, 404 for an unknown ref', async () => {
  const response = await request(app.getHttpServer()).get('/api/v1/indicators/' + encodeURIComponent('builtin:rsi@1')).expect(200);
  expect(IndicatorDetailResponseSchema.parse(response.body).definition.shortName).toBe('RSI');
  const missing = await request(app.getHttpServer()).get('/api/v1/indicators/' + encodeURIComponent('builtin:rsi@7')).expect(404);
  expect(missing.body).toMatchObject({ code: 'NOT_FOUND', details: { ref: 'builtin:rsi@7' } });
});

it('computes a built-in with TradingView inputs and satisfies the contract', async () => {
  const response = await compute({ symbol: 'NSE:X', interval: '1', indicator: { kind: 'builtin', id: 'sma', inputs: { length: 3 } }, range: { limit: 4 } }).expect(200);
  const result = IndicatorResultSchema.parse(response.body);
  expect(result.times).toEqual([36, 37, 38, 39].map(i => i * 60_000));
  expect(result.plots).toEqual([{ id: 'ma', values: [46, 47, 48, 49] }]);
  expect(bars).toHaveBeenCalledWith('NSE:X', '1', { latest: true }, 7);
});

it('rejects malformed requests and bad inputs with 422 naming the input', async () => {
  await compute({ symbol: 'NSE:X', interval: '2', indicator: { kind: 'builtin', id: 'sma' } }).expect(422);
  await compute({ symbol: 'NSE:X', interval: '1', indicator: { kind: 'builtin', id: 'sma' }, extra: 1 }).expect(422);
  const bad = await compute({ symbol: 'NSE:X', interval: '1', indicator: { kind: 'builtin', id: 'sma', inputs: { length: 0 } } }).expect(422);
  expect(bad.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { input: 'length' } });
});

it('takes Pine through the same endpoint and says why it cannot run yet', async () => {
  const response = await compute({ symbol: 'NSE:X', interval: '1', indicator: { kind: 'pine', source: '//@version=6\nindicator("x")\nplot(close)' } }).expect(422);
  expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'UNSUPPORTED' } });
});

it('describes a Pine script as a definition, and says which feature it cannot run (FR-IN-4)', async () => {
  const post = (source: string) => request(app.getHttpServer()).post('/api/v1/indicators/describe').send({ source });
  const ok = await post('//@version=5\nindicator("x")').expect(200);
  expect(IndicatorDefinitionSchema.parse((ok.body as { definition: unknown }).definition).inputs[0]).toMatchObject({ id: 'length', type: 'int' });
  const bad = await post('strategy("x")').expect(422);
  expect(bad.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'UNSUPPORTED', feature: 'strategy()', line: 1 } });
  await request(app.getHttpServer()).post('/api/v1/indicators/describe').send({}).expect(422);
});

it('rate limits with 429', async () => {
  for (let i = 0; i < 30; i++) await request(app.getHttpServer()).get('/api/v1/indicators').expect(200);
  await request(app.getHttpServer()).get('/api/v1/indicators').expect(429);
});
