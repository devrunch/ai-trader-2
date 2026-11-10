import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BarsResponseSchema, QuoteResponseSchema } from '@aitrader/contracts';
import { configureApp } from '../../../app.setup';
import { GlobalExceptionFilter } from '../../../shared/errors';
import { MarketDataService, GetQuote } from '../application';
import { MarketDataController } from './market-data.controller';
import { IpRateLimitGuard } from '../../../shared/http/ip-rate-limit.guard';
import { ResolveInstrument } from '../../instruments/application/index';
import { ReadSeq } from '../application/read-seq';
import { BarSeqResponseSchema, QuotesResponseSchema } from '@aitrader/contracts';
import { SymbolNotFoundError } from '../../../shared/errors';

// FR-CH-5, FR-UI-7/8, SRD ?11
let app: INestApplication<Server>;
const bars = vi.fn<MarketDataService['bars']>();
const quote = vi.fn<GetQuote['execute']>();
beforeEach(async () => {
  bars.mockReset().mockResolvedValue({ instrumentId: 'NSE:TEST', resolvedId: 'NSE:TEST', interval: '1', bars: [], nextBefore: null, status: { state: 'stale', reason: 'NO_DATA' } });
  quote.mockReset().mockResolvedValue({ instrumentId: 'NSE:TEST', resolvedId: 'NSE:TEST', price: 10, at: 1, change: null, changePct: null, status: { state: 'ok' } });
  const module = await Test.createTestingModule({ controllers: [MarketDataController], providers: [
    { provide: IpRateLimitGuard, useValue: new IpRateLimitGuard(60, 20, () => 0) }, GlobalExceptionFilter,
    { provide: PinoLogger, useValue: new PinoLogger({ pinoHttp: { level: 'silent' } }) },
    { provide: MarketDataService, useValue: { bars } }, { provide: GetQuote, useValue: { execute: quote } },
    { provide: ResolveInstrument, useValue: { execute: (id: string) => Promise.resolve({ instrument: { id: { toString: () => id } } }) } },
    { provide: ReadSeq, useValue: { current: () => Promise.resolve(4) } },
  ] }).compile();
  app = module.createNestApplication(); configureApp(app); await app.init();
});
afterEach(async () => { await app.close(); });
it('validates query params', async () => {
  for (const query of ['symbol=NSE:X&interval=2', 'symbol=NSE:X&interval=1&limit=0', 'symbol=NSE:X&interval=1&limit=5001',
    'symbol=NSE:X&interval=1&before=no', 'interval=1', 'symbol=NSE:X&interval=1&limit=1.5']) {
    await request(app.getHttpServer()).get('/api/v1/bars?' + query).expect(422);
  }
  await request(app.getHttpServer()).get('/api/v1/bars?symbol=NSE:X&interval=1').expect(200);
  expect(bars).toHaveBeenCalledWith('NSE:X', '1', { latest: true }, 500);
});
it('rejects before and since together', async () => {
  await request(app.getHttpServer()).get('/api/v1/bars?symbol=NSE:X&interval=1&before=2&since=1').expect(422);
});
it('encodes symbols with colons and spaces', async () => {
  const id = 'BSE:BSE SENSEX SIXTY 65:35';
  await request(app.getHttpServer()).get('/api/v1/bars?symbol=' + encodeURIComponent(id) + '&interval=1&since=1&limit=5').expect(200);
  expect(bars).toHaveBeenCalledWith(id, '1', { since: 1 }, 5);
  await request(app.getHttpServer()).get('/api/v1/quote/' + encodeURIComponent(id)).expect(200);
  expect(quote).toHaveBeenCalledWith(id);
});
it('responses satisfy the contracts', async () => {
  const b = await request(app.getHttpServer()).get('/api/v1/bars?symbol=NSE:X&interval=1&before=2').expect(200);
  const q = await request(app.getHttpServer()).get('/api/v1/quote/NSE%3AX').expect(200);
  expect(BarsResponseSchema.safeParse(b.body).success).toBe(true); expect(QuoteResponseSchema.safeParse(q.body).success).toBe(true);
});
it('returns the current canonical instrument sequence (FR-LS-2 E10)', async () => {
  const response = await request(app.getHttpServer()).get('/api/v1/bars/seq?symbol=NSE%3AX').expect(200);
  expect(response.body).toEqual({ instrumentId: 'NSE:X', seq: 4 });
  expect(BarSeqResponseSchema.safeParse(response.body).success).toBe(true);
});
it('rate limits with 429', async () => {
  for (let i = 0; i < 60; i++) await request(app.getHttpServer()).get('/api/v1/quote/NSE%3AX').expect(200);
  const response = await request(app.getHttpServer()).get('/api/v1/bars?symbol=NSE:X&interval=1').expect(429);
  expect(response.headers['retry-after']).toBe('1'); expect(response.body).toMatchObject({ code: 'RATE_LIMITED' });
});
it('quotes a whole watchlist in one request; one bad id does not fail the batch', async () => {
  quote.mockImplementation(id => id === 'NSE:BAD' ? Promise.reject(new SymbolNotFoundError('nope', { id })) : Promise.resolve({ instrumentId: id, resolvedId: id, price: 10, at: 1, change: 1, changePct: 10, status: { state: 'ok' } }));
  const res = await request(app.getHttpServer()).get('/api/v1/quotes?ids=' + encodeURIComponent('NSE:A,NSE:BAD,NSE:A,NSE:B')).expect(200);
  expect(QuotesResponseSchema.parse(res.body).quotes).toEqual([
    expect.objectContaining({ instrumentId: 'NSE:A', price: 10 }), { instrumentId: 'NSE:BAD', error: 'SYMBOL_NOT_FOUND' }, expect.objectContaining({ instrumentId: 'NSE:B' }),
  ]);
  expect(quote).toHaveBeenCalledTimes(3);
  await request(app.getHttpServer()).get('/api/v1/quotes?ids=' + Array.from({ length: 51 }, (_, i) => `NSE:S${String(i)}`).join(',')).expect(422);
});
