import type { Redis } from 'ioredis';
import { z } from 'zod';
import type { PreviousCloseStore } from '../application/ports/previous-close';

const record = z.object({ close: z.number().positive(), forDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const TTL_SECONDS = 5 * 86_400;

/** `md:prev-close:<id>` → the official previous close and the trading date it applies to. */
export class RedisPreviousCloseStore implements PreviousCloseStore {
  constructor(private readonly redis: Redis) {}
  async get(instrumentId: string): Promise<{ close: number; forDate: string } | null> {
    const raw = await this.redis.get(`md:prev-close:${instrumentId}`);
    if (raw === null) return null;
    try { const parsed = record.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : null; } catch { return null; }
  }
  async set(instrumentId: string, close: number, forDate: string): Promise<void> {
    await this.redis.set(`md:prev-close:${instrumentId}`, JSON.stringify({ close, forDate }), 'EX', TTL_SECONDS);
  }
}
