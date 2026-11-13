import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Depth } from '@aitrader/contracts';
import { DEPTH_TTL_SECONDS, RedisDepthStore } from '../src/modules/market-data/infrastructure/redis-depth-store';
import { startRedis } from './support/containers';

const depth: Depth = { instrumentId: 'NSE:TEST', at: 1_794_209_750_000, source: 'kite', levels: '5',
  bids: [{ price: 99, quantity: 10, orders: 1 }], asks: [{ price: 101, quantity: 30, orders: 2 }],
  spread: 2, spreadPct: 2, totalBidQty: 10, totalAskQty: 30, imbalance: -0.5 };

describe('FR-MD-2 RedisDepthStore', () => {
  let container: Awaited<ReturnType<typeof startRedis>>;
  let redis: Redis;
  beforeAll(async () => { container = await startRedis(); redis = new Redis(container.url); });
  afterAll(async () => { redis.disconnect(); await container.stop(); });

  it('round-trips a book and expires it within the short TTL', async () => {
    const store = new RedisDepthStore(redis);
    expect(await store.get('NSE:TEST')).toBeNull();
    await store.set('NSE:TEST', depth);
    expect(await store.get('NSE:TEST')).toEqual(depth);
    const ttl = await redis.ttl('depth:NSE:TEST');
    expect(ttl).toBeGreaterThan(0); expect(ttl).toBeLessThanOrEqual(DEPTH_TTL_SECONDS);
  });
  it('a repeated write replaces the book and renews the expiry', async () => {
    const store = new RedisDepthStore(redis);
    await store.set('NSE:TEST', depth); await store.set('NSE:TEST', { ...depth, at: depth.at + 1000 });
    expect((await store.get('NSE:TEST'))?.at).toBe(depth.at + 1000);
  });
  it('a corrupt or foreign-shaped value reads as missing', async () => {
    await redis.set('depth:NSE:BAD', 'not json'); await redis.set('depth:NSE:ODD', '{"a":1}');
    const store = new RedisDepthStore(redis);
    expect(await store.get('NSE:BAD')).toBeNull(); expect(await store.get('NSE:ODD')).toBeNull();
  });
  it('reports storage unavailable when Redis is stopped', async () => {
    const dead = new Redis(container.url, { maxRetriesPerRequest: 0, enableOfflineQueue: false, retryStrategy: () => null });
    dead.disconnect();
    await expect(new RedisDepthStore(dead).get('NSE:TEST')).rejects.toMatchObject({ message: 'Depth storage unavailable' });
  });
});
