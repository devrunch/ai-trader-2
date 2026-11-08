import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { InstrumentSearchResponseSchema, ResolvedInstrumentResponseSchema } from '@aitrader/contracts';
import { configureApp } from '../../../app.setup';
import { GlobalExceptionFilter } from '../../../shared/errors';
import { ResolveInstrument, SearchInstruments } from '../application';
import { instrument, repository, index } from '../application/instruments.spec-helper';
import { InstrumentsController } from './instruments.controller';
import { CLOCK, InstrumentsRateLimitGuard } from './instruments-rate-limit.guard';

// FR-SY-6, FR-SY-7, SRD ?11
let app: INestApplication<Server>;
let repo: ReturnType<typeof repository>;
let now: number;
beforeEach(async () => {
  now = 0;
  repo = repository();
  const searchIndex = index();
  searchIndex.suggest.mockReturnValue([instrument('NSE:RELIANCE').id]);
  searchIndex.search.mockReturnValue([{ id: 'NSE:RELIANCE', description: 'Reliance', exchange: 'NSE', type: 'stock', currency: 'INR', status: 'active' }]);
  const module = await Test.createTestingModule({
    controllers: [InstrumentsController], providers: [InstrumentsRateLimitGuard, GlobalExceptionFilter,
      { provide: CLOCK, useValue: () => now },
      { provide: PinoLogger, useValue: new PinoLogger({ pinoHttp: { level: 'silent' } }) },
      { provide: SearchInstruments, useValue: new SearchInstruments(searchIndex) },
      { provide: ResolveInstrument, useValue: new ResolveInstrument(repo, searchIndex) }],
  }).compile();
  app = module.createNestApplication(); configureApp(app); await app.init();
});
afterEach(async () => { await app.close(); });
it('GET search returns contract-shaped results', async () => {
  const response = await request(app.getHttpServer()).get('/api/v1/instruments/search?q=reliance').expect(200);
  expect(InstrumentSearchResponseSchema.parse(response.body)).toEqual({ query: 'reliance', results: [{ id: 'NSE:RELIANCE', description: 'Reliance', exchange: 'NSE', type: 'stock', currency: 'INR', status: 'active' }] });
});
it('rejects invalid query params with 422', async () => {
  for (const query of ['q=' + 'a'.repeat(65), 'exchange=nse', 'type=crypto', 'limit=0', 'limit=51', 'limit=1.5', 'limit=no', 'q=x&q=y']) {
    const response = await request(app.getHttpServer()).get('/api/v1/instruments/search?' + query).expect(422);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  }
});
it('GET by id resolves a URL-encoded id with spaces and colons', async () => {
  const id = 'BSE:BSE SENSEX SIXTY 65:35'; repo.findById.mockResolvedValue(instrument(id));
  const response = await request(app.getHttpServer()).get('/api/v1/instruments/' + encodeURIComponent(id)).expect(200);
  expect(ResolvedInstrumentResponseSchema.parse(response.body).instrument.id).toBe(id);
  expect(repo.findById).toHaveBeenCalledWith(id);
});
it('GET by id returns 404 SYMBOL_NOT_FOUND with suggestions', async () => {
  const response = await request(app.getHttpServer()).get('/api/v1/instruments/NSE%3ARELIANSE').expect(404);
  expect(response.body).toMatchObject({ code: 'SYMBOL_NOT_FOUND', details: { suggestions: ['NSE:RELIANCE'] } });
});
it('continuous ids return via continuous', async () => {
  repo.listContinuousCandidates.mockResolvedValue([instrument('MCX:GOLD27JANFUT', { type: 'futures', expiry: '2099-01-01' })]);
  const response = await request(app.getHttpServer()).get('/api/v1/instruments/MCX%3AGOLD1!').expect(200);
  expect(response.body).toMatchObject({ via: 'continuous', resolvedFrom: 'MCX:GOLD1!' });
});
it('rate limits search with 429 and Retry-After', async () => {
  const responses = await Promise.all(Array.from({ length: 40 }, () => request(app.getHttpServer()).get('/api/v1/instruments/search')));
  expect(responses.filter(r => r.status === 200)).toHaveLength(30);
  const limited = responses.filter(r => r.status === 429);
  expect(limited).toHaveLength(10);
  for (const response of limited) {
    expect(response.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(response.headers['retry-after']).toBe('1');
  }
  await request(app.getHttpServer()).get('/api/v1/instruments/NSE%3ARELIANCE').expect(429);
  repo.findById.mockResolvedValue(instrument('NSE:RELIANCE'));
  now += 1000;
  await request(app.getHttpServer()).get('/api/v1/instruments/NSE%3ARELIANCE').expect(200);
});
it('responses satisfy the contract schemas', async () => {
  repo.findById.mockResolvedValue(instrument('NSE:RELIANCE'));
  const search = await request(app.getHttpServer()).get('/api/v1/instruments/search').expect(200);
  const resolved = await request(app.getHttpServer()).get('/api/v1/instruments/NSE%3ARELIANCE').expect(200);
  expect(InstrumentSearchResponseSchema.safeParse(search.body).success).toBe(true);
  expect(ResolvedInstrumentResponseSchema.safeParse(resolved.body).success).toBe(true);
});
