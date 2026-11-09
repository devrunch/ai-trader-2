import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisFeedLeadership } from '../src/modules/market-data/infrastructure/process/redis-feed-leadership';
import { startRedis } from './support/containers';

// FR-AC-2: the admin view reads the leader lease and live subscription leases.
describe('RedisFeedLeadership', () => {
  let container: Awaited<ReturnType<typeof startRedis>>;
  let redis: Redis;
  const now = 1_000_000;
  beforeAll(async () => { container = await startRedis(); redis = new Redis(container.url); });
  beforeEach(async () => { await redis.flushall(); });
  afterAll(async () => { redis.disconnect(); await container.stop(); });

  it('reports the leader and its remaining lease, or null without one', async () => {
    const leadership = new RedisFeedLeadership(redis, () => now);
    expect(await leadership.leader()).toBeNull();
    await redis.set('md:leader', 'md-host-1', 'PX', 10_000);
    const leader = await leadership.leader();
    expect(leader?.instanceId).toBe('md-host-1');
    expect(leader?.ttlMs).toBeGreaterThan(0);
  });

  it('counts unexpired subscription leases per instrument and ignores expired ones', async () => {
    await redis.zadd('md:subs', now + 60_000, 'api-1|NSE:RELIANCE', now + 60_000, 'api-2|NSE:RELIANCE', now + 60_000, 'api-1|NSE:TCS', now - 1, 'api-3|NSE:INFY');
    expect(await new RedisFeedLeadership(redis, () => now).subscriptions()).toEqual([
      { instrumentId: 'NSE:RELIANCE', count: 2 }, { instrumentId: 'NSE:TCS', count: 1 },
    ]);
  });
});
