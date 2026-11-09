import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LeaderLock } from '../src/modules/market-data/infrastructure/process/leader-lock';
import { FeedStatePublisher } from '../src/modules/market-data/infrastructure/process/feed-state.publisher';
import { RequestSubscription } from '../src/modules/market-data/application/request-subscription';
import { RedisSubscriptionLeases } from '../src/modules/market-data/infrastructure/redis-subscription-leases';
import { SubscriptionRequests } from '../src/modules/market-data/infrastructure/process/subscription-requests';
import { RedisFeedStateStore } from '../src/modules/market-data/infrastructure/feed-state.store';
import { startRedis } from './support/containers';
import { LiveBars } from '../src/modules/market-data/application/live-bars';
import type { LiveFeed, Tick } from '../src/modules/market-data/application/ports/live-feed';
import type { FormingBarStore } from '../src/modules/market-data/application/ports/forming-bar-store';
import { historyFixture, historyBar } from '../src/modules/market-data/application/history.spec-helper';

describe('market-data process (SRD §10.5, FR-MD-5, NFR-RB-7, NFR-RB-8, E16, E25)', () => {
  let container: Awaited<ReturnType<typeof startRedis>> | undefined;
  let redis: Redis | undefined;
  beforeAll(async () => {
    container = await startRedis(); redis = new Redis(container.url); await redis.ping();
  });
  afterAll(async () => { redis?.disconnect(); await container?.stop(); });

  it('only one of two processes becomes leader', async () => {
    if (!redis) throw new Error('Redis not started');
    const one = new LeaderLock(redis, 'one', { ttlMs: 500, renewMs: 100 });
    const two = new LeaderLock(redis, 'two', { ttlMs: 500, renewMs: 100 });
    const first = new AbortController(); const second = new AbortController(); let acquiredOne = 0; let acquiredTwo = 0;
    const loopOne = one.acquireLoop(first.signal, () => { acquiredOne++; return Promise.resolve(); }, () => Promise.resolve());
    const loopTwo = two.acquireLoop(second.signal, () => { acquiredTwo++; return Promise.resolve(); }, () => Promise.resolve());
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(acquiredOne + acquiredTwo).toBe(1);
    first.abort(); second.abort(); await Promise.all([loopOne, loopTwo]); await one.release(); await two.release();
  });

  it('standby takes over within 15 seconds when the leader dies (E25)', async () => {
    if (!redis) throw new Error('Redis not started');
    const first = new LeaderLock(redis, 'first', { ttlMs: 1000, renewMs: 100 });
    const standby = new LeaderLock(redis, 'standby', { ttlMs: 1000, renewMs: 100 });
    const firstSignal = new AbortController(); const standbySignal = new AbortController();
    const firstLoop = first.acquireLoop(firstSignal.signal, () => Promise.resolve(), () => Promise.resolve());
    const standbyLoop = standby.acquireLoop(standbySignal.signal, () => Promise.resolve(), () => Promise.resolve());
    await new Promise(resolve => setTimeout(resolve, 150)); firstSignal.abort();
    const started = Date.now();
    while (Date.now() - started < 12000) {
      if (await redis.get('md:leader') === 'standby') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    expect(await redis.get('md:leader')).toBe('standby');
    standbySignal.abort(); await Promise.all([firstLoop, standbyLoop]); await standby.release();
  });

  it('api acquire reaches the leader subscription listener', async () => {
    if (!redis) throw new Error('Redis not started');
    const requests = new SubscriptionRequests(redis); const received = new Promise<number>(resolve => {
      requests.onChange((id, count) => { if (id === 'NSE:TEST') resolve(count); });
    });
    await requests.current();
    const leases = new RedisSubscriptionLeases(redis, 'test-api');
    await new RequestSubscription(leases).acquire('NSE:TEST');
    await expect(received).resolves.toBe(1);
    expect((await requests.current()).get('NSE:TEST')).toBe(1);
    requests.close(); await leases.onModuleDestroy();
  });

  it("api instance crash releases interest after the lease", async () => {
    if (!redis) throw new Error('Redis not started');
    const dead = new RedisSubscriptionLeases(redis, 'dead-api', { leaseMs: 80, refreshMs: 10_000 });
    await dead.add('NSE:TEST');
    await new Promise(resolve => setTimeout(resolve, 100));
    await redis.zremrangebyscore('md:subs', '-inf', Date.now());
    await expect(redis.zrangebyscore('md:subs', Date.now(), '+inf')).resolves.toEqual([]);
    await dead.onModuleDestroy();
  });

  it('two instances keep the instrument while either holds it', async () => {
    if (!redis) throw new Error('Redis not started');
    const first = new RedisSubscriptionLeases(redis, 'api-first');
    const second = new RedisSubscriptionLeases(redis, 'api-second');
    await first.add('NSE:TEST'); await second.add('NSE:TEST');
    await first.remove('NSE:TEST');
    expect(await redis.zrangebyscore('md:subs', Date.now(), '+inf')).toEqual(['api-second|NSE:TEST']);
    await second.onModuleDestroy(); await first.onModuleDestroy();
  });

  it('a deposed leader stops writing bars (E16)', async () => {
    const { store } = historyFixture();
    const upsert = vi.spyOn(store, 'upsert1m');
    const forming: FormingBarStore = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined) };
    const setForming = vi.spyOn(forming, 'set');
    let onTick: (tick: Tick) => void = () => {};
    const feed: LiveFeed = { name: 'kite', subscribe: async () => {}, unsubscribe: async () => {}, start: async () => {}, stop: async () => {},
      onState: () => () => {}, onTick: listener => { onTick = listener; return () => {}; } };
    const bars = new LiveBars(store, forming, { clock: Date.now, log: () => {}, canPersist: () => Promise.resolve(false) });
    const detach = bars.attach(feed);
    onTick({ instrumentId: 'NSE:TEST', at: historyBar.time, price: 10, cumVolume: 1 });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(setForming.mock.calls).toHaveLength(0); expect(upsert.mock.calls).toHaveLength(0); detach();
  });

  it('feed state published by the leader is read by RedisFeedStateStore', async () => {
    if (!redis) throw new Error('Redis not started');
    await new FeedStatePublisher(redis, () => 1234).publish('kite', 'stale', 'AUTH_EXPIRED');
    await expect(new RedisFeedStateStore(redis).get('kite')).resolves.toEqual({ state: 'stale', reason: 'AUTH_EXPIRED', at: 1234 });
  });
});
