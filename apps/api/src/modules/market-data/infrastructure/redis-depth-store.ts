import type { Redis } from 'ioredis';
import { DepthSchema, type Depth } from '@aitrader/contracts';
import { redisCall } from '../../../shared/redis';
import type { DepthStore } from '../application/ports/depth-store';

/** Short enough that a closed market or a dead feed reads as "no book" instead of a stale one. */
export const DEPTH_TTL_SECONDS = 15;
/** The closing book stays readable over a long weekend. */
const LAST_TTL_SECONDS = 4 * 86_400;

export class RedisDepthStore implements DepthStore {
  constructor(private readonly redis: Redis) {}

  get(instrumentId: string, signal?: AbortSignal): Promise<Depth | null> { return this.read(`depth:${instrumentId}`, signal); }

  last(instrumentId: string, signal?: AbortSignal): Promise<Depth | null> { return this.read(`depth:last:${instrumentId}`, signal); }

  private async read(key: string, signal?: AbortSignal): Promise<Depth | null> {
    return this.run(async () => {
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      const parsed = DepthSchema.safeParse(parseJson(raw));
      return parsed.success ? parsed.data : null;
    }, signal);
  }

  async set(instrumentId: string, depth: Depth, signal?: AbortSignal): Promise<void> {
    // Plain overwrite with expiry: a repeated write of the same book is harmless.
    const json = JSON.stringify(depth);
    await this.run(async () => { await this.redis.multi().set(`depth:${instrumentId}`, json, 'EX', DEPTH_TTL_SECONDS).set(`depth:last:${instrumentId}`, json, 'EX', LAST_TTL_SECONDS).exec(); }, signal);
  }

  private run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> { return redisCall('Depth storage unavailable', operation, signal); }
}

function parseJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return null; }
}
