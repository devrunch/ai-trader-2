import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { MarketDataController } from '../src/modules/market-data/api/market-data.controller';
import { MarketDataRateLimitGuard } from '../src/modules/market-data/api/market-data-rate-limit.guard';
import { RedisBarPublisher } from '../src/modules/market-data/infrastructure/redis-bar-publisher';
import { RedisBarSequenceStore } from '../src/modules/market-data/infrastructure/redis-bar-sequence-store';
import { ReadSeq } from '../src/modules/market-data/application/read-seq';
import { MarketDataService, GetQuote } from '../src/modules/market-data/application';
import { ResolveInstrument } from '../src/modules/instruments/application/index';
import { IpRateLimitGuard } from '../src/shared/http';
import { startRedis } from './support/containers';
import type { Bar } from '../src/modules/market-data/domain/bar';

describe('bar fan-out (FR-LS-2 FR-LS-4 E10 E16)', () => {
  let container: Awaited<ReturnType<typeof startRedis>> | undefined;
  let redis: Redis | undefined;
  beforeAll(async () => { container = await startRedis(); redis = new Redis(container.url, { commandTimeout: 3000 }); await redis.ping(); });
  beforeEach(async () => { await redis?.flushdb(); });
  afterAll(async () => { await redis?.quit(); await container?.stop(); });
  function stores() {
    if (!redis) throw new Error('Redis not started');
    return { publisher: new RedisBarPublisher(redis), sequence: new ReadSeq(new RedisBarSequenceStore(redis)) };
  }
  const bar: Bar = { time: 1794195900000, open: 10, high: 12, low: 9, close: 11, volume: 2 };

  it('a subscriber receives updates in seq order', async () => {
    if (!redis) throw new Error('Redis not started');
    if (!container) throw new Error('Redis container not started');
    const subscriber = new Redis(container.url);
    await subscriber.subscribe('md:bars:NSE:TEST');
    const received: number[] = [];
    subscriber.on('message', (_channel, value: string) => { const body: unknown = JSON.parse(value); if (typeof body === 'object' && body !== null && 'seq' in body && typeof body.seq === 'number') received.push(body.seq); });
    const { publisher } = stores();
    await publisher.publish('NSE:TEST', 'forming', bar); await publisher.publish('NSE:TEST', 'closed', bar);
    await viWait(() => received.length === 2);
    expect(received).toEqual([1, 2]); await subscriber.quit();
  });
  it('replay returns updates after a seq and is empty when too old', async () => {
    const { publisher, sequence } = stores();
    for (let i = 0; i < 305; i++) await publisher.publish('NSE:TEST', 'forming', bar);
    expect((await sequence.replay('NSE:TEST', 302)).map(update => update.seq)).toEqual([303, 304, 305]);
    expect(await sequence.replay('NSE:TEST', 1)).toEqual([]);
  });
  it('concurrent publishers never duplicate a seq', async () => {
    const { publisher, sequence } = stores();
    await Promise.all(Array.from({ length: 50 }, () => publisher.publish('NSE:TEST', 'forming', bar)));
    const updates = await sequence.replay('NSE:TEST', 0);
    expect(updates.map(update => update.seq)).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
  });
  it('GET /bars/seq returns the current seq', async () => {
    if (!redis) throw new Error('Redis not started');
    const sequence = new ReadSeq(new RedisBarSequenceStore(redis));
    await new RedisBarPublisher(redis).publish('NSE:TEST', 'forming', bar);
    const module = await Test.createTestingModule({ controllers: [MarketDataController], providers: [
      { provide: MarketDataService, useValue: {} }, { provide: GetQuote, useValue: {} },
      { provide: ResolveInstrument, useValue: { execute: () => Promise.resolve({ instrument: { id: { toString: () => 'NSE:TEST' } } }) } },
      { provide: ReadSeq, useValue: sequence }, { provide: IpRateLimitGuard, useValue: { canActivate: () => true } },
      MarketDataRateLimitGuard,
    ] }).compile();
    const app = module.createNestApplication(); app.setGlobalPrefix('api'); await app.init();
    const server = app.getHttpServer() as import('node:http').Server;
    const response = await (await import('supertest')).default(server).get('/api/v1/bars/seq?symbol=NSE%3ATEST').expect(200);
    expect(response.body).toEqual({ instrumentId: 'NSE:TEST', seq: 1 }); await app.close();
  });
});

async function viWait(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!check() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  if (!check()) throw new Error('Timed out waiting for Redis pub/sub message');
}
