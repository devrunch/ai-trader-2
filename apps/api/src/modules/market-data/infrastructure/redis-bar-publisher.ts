import type { Redis } from 'ioredis';
import { BarUpdateSchema } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import type { Bar } from '../domain/bar';
import type { BarPublisher } from '../application/ports/bar-publisher';

const publishScript = `
local seq = redis.call('INCR', KEYS[1])
local update = cjson.decode(ARGV[1])
update.seq = seq
local encoded = cjson.encode(update)
redis.call('PUBLISH', KEYS[2], encoded)
redis.call('LPUSH', KEYS[3], encoded)
redis.call('LTRIM', KEYS[3], 0, 299)
return {seq, encoded}
`;

export class RedisBarPublisher implements BarPublisher {
  constructor(private readonly redis: Redis, private readonly clock: () => number = Date.now) {}

  async publish(instrumentId: string, kind: 'forming' | 'closed', bar: Bar, signal?: AbortSignal): Promise<number> {
    const payload = JSON.stringify({ instrumentId, seq: 1, kind, bar, at: this.clock() });
    const result = await withTimeout(async abort => {
      abort.throwIfAborted();
      return this.redis.eval(publishScript, 3, `md:seq:${instrumentId}`, `md:bars:${instrumentId}`, `md:bars:history:${instrumentId}`, payload);
    }, 3000, signal);
    if (!Array.isArray(result) || typeof result[0] !== 'number' || typeof result[1] !== 'string') throw new Error('Invalid Redis bar publish result');
    const update = BarUpdateSchema.parse(JSON.parse(result[1]));
    if (update.instrumentId !== instrumentId || update.seq !== result[0]) throw new Error('Redis bar publish result did not match request');
    return update.seq;
  }
}
