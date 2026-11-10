import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisPreviousCloseStore } from '../src/modules/market-data/infrastructure/redis-previous-close.store';
import { startRedis } from './support/containers';

describe('RedisPreviousCloseStore', () => {
  let container: Awaited<ReturnType<typeof startRedis>>;
  let redis: Redis;
  beforeAll(async () => { container = await startRedis(); redis = new Redis(container.url); });
  afterAll(async () => { redis.disconnect(); await container.stop(); });

  it('round-trips the close with its trading date and expires within 5 days', async () => {
    const store = new RedisPreviousCloseStore(redis);
    expect(await store.get('NSE:NIFTY')).toBeNull();
    await store.set('NSE:NIFTY', 24_986.4, '2026-11-09');
    expect(await store.get('NSE:NIFTY')).toEqual({ close: 24_986.4, forDate: '2026-11-09' });
    expect(await redis.ttl('md:prev-close:NSE:NIFTY')).toBeGreaterThan(4 * 86_400);
  });

  it('a corrupt value reads as missing', async () => {
    await redis.set('md:prev-close:NSE:BAD', 'not json');
    expect(await new RedisPreviousCloseStore(redis).get('NSE:BAD')).toBeNull();
  });
});
