import { describe, expect, it, vi } from 'vitest';
import { RedisSecondsDemand, RedisSecondsLeases } from './redis-seconds-demand';

describe('FR-CH-8 seconds demand', () => {
  it('reads the unexpired leases of all instances once each and ignores junk', async () => {
    const redis = { zremrangebyscore: vi.fn().mockResolvedValue(0),
      zrangebyscore: vi.fn().mockResolvedValue(['a|NSE:A|1S', 'b|NSE:A|1S', 'a|NSE:A|5S', 'a|NSE:B|9S', 'junk']) };
    expect(await new RedisSecondsDemand(redis as never, () => 5).active()).toEqual([
      { instrumentId: 'NSE:A', interval: '1S' }, { instrumentId: 'NSE:A', interval: '5S' }]);
  });
  it('adds and removes a lease member per instance, instrument and interval', async () => {
    const redis = { zadd: vi.fn().mockResolvedValue(1), zrem: vi.fn().mockResolvedValue(1) };
    const leases = new RedisSecondsLeases(redis as never, 'api1', 1000, () => 10);
    await leases.add('NSE:A', '5S'); await leases.remove('NSE:A', '5S');
    expect(redis.zadd).toHaveBeenCalledWith('md:ssubs', 1010, 'api1|NSE:A|5S');
    expect(redis.zrem).toHaveBeenCalledWith('md:ssubs', 'api1|NSE:A|5S');
    await leases.onModuleDestroy();
  });
});
