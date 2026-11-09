import { afterEach, describe, expect, it, vi } from 'vitest';
import { Redis } from 'ioredis';
import { RequestSubscription } from '../../application/request-subscription';

describe('RequestSubscription (FR-MD-5, E24)', () => {
  let redis: Redis | undefined;
  afterEach(() => { redis?.disconnect(); redis = undefined; vi.restoreAllMocks(); });
  it('ref-counts acquire and release with floor zero', async () => {
    redis = new Redis('redis://127.0.0.1:1', { lazyConnect: true });
    const increment = vi.spyOn(redis, 'hincrby').mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(-1);
    const remove = vi.spyOn(redis, 'hdel').mockResolvedValue(1); const publish = vi.spyOn(redis, 'publish').mockResolvedValue(1);
    const requests = new RequestSubscription(redis);
    await requests.acquire('NSE:TEST'); await requests.release('NSE:TEST'); await requests.release('NSE:TEST');
    expect(increment).toHaveBeenNthCalledWith(1, 'md:subs', 'NSE:TEST', 1);
    expect(increment).toHaveBeenNthCalledWith(2, 'md:subs', 'NSE:TEST', -1);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith('md:subs:changed', JSON.stringify({ instrumentId: 'NSE:TEST', count: 0 }));
  });
});
