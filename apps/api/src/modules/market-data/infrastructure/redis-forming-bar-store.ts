import type { Redis } from 'ioredis';
import { z } from 'zod';
import { redisCall } from '../../../shared/redis';
import type { FormingBarStore } from '../application/ports/forming-bar-store';

const valueSchema = z.object({ bar: z.object({ time: z.number(), open: z.number(), high: z.number(), low: z.number(),
  close: z.number(), volume: z.number().nullable(), repaired: z.boolean().optional() }), cumVolume: z.number().nullable(), seq: z.number().nullable() });

export class RedisFormingBarStore implements FormingBarStore {
  constructor(private readonly redis: Redis) {}

  async get(instrumentId: string, signal?: AbortSignal): ReturnType<FormingBarStore['get']> {
    return this.run(async () => {
      const raw = await this.redis.hget(`bar:forming:${instrumentId}`, 'value');
      if (raw === null) return null;
      const { bar, cumVolume, seq } = valueSchema.parse(JSON.parse(raw));
      const { repaired, ...prices } = bar;
      return { bar: { ...prices, ...(repaired === undefined ? {} : { repaired }) }, lastCumVolume: cumVolume, seq };
    }, signal);
  }

  async set(instrumentId: string, v: Parameters<FormingBarStore['set']>[1], signal?: AbortSignal): Promise<void> {
    await this.run(async () => {
      // Atomic replacement and expiry make repeated sets safe, including process restarts.
      const result = await this.redis.multi().hset(`bar:forming:${instrumentId}`, 'value',
        JSON.stringify({ bar: v.bar, cumVolume: v.lastCumVolume, seq: v.seq })).expire(`bar:forming:${instrumentId}`, 172800).exec();
      if (!result || result.some(([error]) => error !== null)) throw new Error('Forming bar transaction failed');
    }, signal);
  }

  async clear(instrumentId: string, signal?: AbortSignal): Promise<void> {
    await this.run(async () => { await this.redis.del(`bar:forming:${instrumentId}`); }, signal);
  }

  private run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> { return redisCall('Forming bar storage unavailable', operation, signal); }
}
