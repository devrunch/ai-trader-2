import type { Redis } from 'ioredis';
import { BarSchema, SECOND_BAR_RING } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import type { Bar } from '../domain/bar';
import type { SecondInterval } from '../domain/interval';
import type { SecondsStore } from '../application/ports/seconds-store';

const TTL_MS = 12 * 3600_000;
const secondsKey = (instrumentId: string, interval: SecondInterval): string => `md:sec:${instrumentId}:${interval}`;
const secondsChannel = (instrumentId: string, interval: SecondInterval): string => `md:sbars:${instrumentId}:${interval}`;

/** A Redis sorted set capped at SECOND_BAR_RING bars per key, expiring on its own; second bars never reach Postgres. */
export class RedisSecondsStore implements SecondsStore {
  constructor(private readonly redis: Redis, private readonly cap: number = SECOND_BAR_RING) {}

  async put(instrumentId: string, interval: SecondInterval, kind: 'forming' | 'closed', bar: Bar): Promise<void> {
    const key = secondsKey(instrumentId, interval);
    const body = JSON.stringify(bar);
    await withTimeout(async abort => {
      abort.throwIfAborted();
      const result = await this.redis.multi().zremrangebyscore(key, bar.time, bar.time).zadd(key, bar.time, body)
        .zremrangebyrank(key, 0, -(this.cap + 1)).pexpire(key, TTL_MS).publish(secondsChannel(instrumentId, interval), JSON.stringify({ kind, bar })).exec();
      if (!result || result.some(([error]) => error !== null)) throw new Error('Seconds ring write failed');
    }, 3000);
  }

  async read(instrumentId: string, interval: SecondInterval, limit: number, before?: number): Promise<Bar[]> {
    const raw = await withTimeout(async abort => {
      abort.throwIfAborted();
      return this.redis.zrevrangebyscore(secondsKey(instrumentId, interval), before === undefined ? '+inf' : `(${String(before)}`, '-inf', 'LIMIT', 0, limit);
    }, 3000);
    const bars: Bar[] = [];
    for (const item of raw) {
      const { repaired, ...bar } = BarSchema.parse(JSON.parse(item));
      bars.push(repaired === undefined ? bar : { ...bar, repaired });
    }
    return bars.reverse();
  }
}
