import { afterEach, describe, expect, it, vi } from 'vitest';
import { Redis } from 'ioredis';
import { RedisSubscriptionLeases } from './redis-subscription-leases';

describe('RedisSubscriptionLeases (FR-LS-4, E24)', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  it('a redis failure during lease refresh does not reject unhandled', async () => {
    vi.useFakeTimers();
    const redis = new Redis('redis://127.0.0.1:1', { lazyConnect: true }); redis.on('error', () => undefined);
    const add = vi.spyOn(redis, 'zadd').mockResolvedValue(1);
    vi.spyOn(redis, 'zrem').mockResolvedValue(1);
    vi.spyOn(redis, 'publish').mockResolvedValue(1);
    const warn = vi.fn();
    const leases = new RedisSubscriptionLeases(redis, 'api-a', { refreshMs: 20, warn });
    await leases.add('NSE:TEST');
    add.mockRejectedValue(new TypeError('redis unavailable'));
    const unhandled = vi.fn(); process.on('unhandledRejection', unhandled);
    await vi.advanceTimersByTimeAsync(20);
    expect(warn).toHaveBeenCalledWith('Lease refresh failed: TypeError');
    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled); await leases.onModuleDestroy(); redis.disconnect();
  });
});
