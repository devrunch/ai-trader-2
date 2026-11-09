import { afterEach, describe, expect, it, vi } from 'vitest';
import { Redis } from 'ioredis';
import { SubscriptionRequests } from './subscription-requests';

describe('SubscriptionRequests (FR-LS-4, E24)', () => {
  let redis: Redis | undefined;
  afterEach(() => { redis?.disconnect(); redis = undefined; vi.restoreAllMocks(); });
  it('reads active leases and expires dead instance members', async () => {
    redis = new Redis('redis://127.0.0.1:1', { lazyConnect: true });
    redis.on('error', () => undefined);
    Object.defineProperty(redis, 'status', { value: 'ready' });
    vi.spyOn(redis, 'duplicate').mockReturnValue(redis);
    vi.spyOn(redis, 'subscribe').mockResolvedValue(1);
    const removeExpired = vi.spyOn(redis, 'zremrangebyscore').mockResolvedValue(1);
    vi.spyOn(redis, 'zrangebyscore').mockResolvedValue(['api-1|NSE:TEST']);
    const requests = new SubscriptionRequests(redis);
    await expect(requests.current()).resolves.toEqual(new Map([['NSE:TEST', 1]]));
    expect(removeExpired.mock.calls[0]).toEqual(['md:subs', '-inf', expect.any(Number)]);
    requests.close(); redis.disconnect();
  });

  it('a redis failure during lease refresh or cleanup does not reject unhandled', async () => {
    vi.useFakeTimers();
    redis = new Redis('redis://127.0.0.1:1', { lazyConnect: true });
    redis.on('error', () => undefined);
    Object.defineProperty(redis, 'status', { value: 'ready' });
    vi.spyOn(redis, 'duplicate').mockReturnValue(redis);
    vi.spyOn(redis, 'subscribe').mockResolvedValue(1);
    vi.spyOn(redis, 'zremrangebyscore').mockRejectedValue(new TypeError('redis unavailable'));
    const warn = vi.fn();
    const requests = new SubscriptionRequests(redis, warn);
    const unhandled = vi.fn(); process.on('unhandledRejection', unhandled);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(warn).toHaveBeenCalledWith('Subscription cleanup failed: TypeError');
    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled); requests.close(); vi.useRealTimers();
  });
});
