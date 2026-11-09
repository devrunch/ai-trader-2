import type { Redis } from 'ioredis';
import { BarUpdateSchema } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import type { BarSequenceStore } from '../application/ports/bar-sequence-store';

export class RedisBarSequenceStore implements BarSequenceStore {
  constructor(private readonly redis: Redis) {}
  async current(instrumentId: string): Promise<number> {
    return withTimeout(async abort => {
      abort.throwIfAborted();
      const value = await this.redis.get(`md:seq:${instrumentId}`);
      if (value === null) return 0;
      const seq = Number(value);
      if (!Number.isSafeInteger(seq) || seq < 0) throw new Error('Invalid Redis bar sequence');
      return seq;
    }, 3000);
  }
  async updates(instrumentId: string) {
    return withTimeout(async abort => {
      abort.throwIfAborted();
      const values = await this.redis.lrange(`md:bars:history:${instrumentId}`, 0, 299);
      return values.map(value => BarUpdateSchema.parse(JSON.parse(value)));
    }, 3000);
  }
}
