import { ScanResultSchema, type ScanResult } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import type { Redis } from 'ioredis';
import type { ResultCache } from '../application/ports';

/** Scan results by key for a short time; a value that no longer parses counts as a miss. */
export class RedisResultCache implements ResultCache {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<ScanResult | null> {
    const raw = await withTimeout(() => this.redis.get(key), 1500);
    if (raw === null) return null;
    try {
      const parsed = ScanResultSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch { return null; }
  }

  async set(key: string, result: ScanResult, ttlSeconds: number): Promise<void> {
    await withTimeout(() => this.redis.set(key, JSON.stringify(result), 'EX', ttlSeconds), 1500);
  }
}
