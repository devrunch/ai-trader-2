import type { Redis } from 'ioredis';
import { z } from 'zod';
import { PROVIDER_REASONS } from '@aitrader/contracts';
import type { FeedStateRecord, FeedStateStore, FeedVendor } from '../application/ports/feed-state-store';

const recordSchema = z.object({
  state: z.enum(['connecting', 'live', 'reconnecting', 'stale', 'stopped']),
  reason: z.enum(PROVIDER_REASONS).optional(),
  at: z.number().int(),
});

const feedStateKey = (vendor: FeedVendor): string => `md:feed-state:${vendor}`;

// A missing, malformed or unreadable record is 'unknown', never an error: status must not fail a read.
export class RedisFeedStateStore implements FeedStateStore {
  constructor(private readonly redis: Redis) {}

  async get(vendor: FeedVendor): Promise<FeedStateRecord> {
    try {
      const raw = await this.redis.get(feedStateKey(vendor));
      if (raw === null) return { state: 'unknown' };
      const parsed = recordSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) return { state: 'unknown' };
      const { state, reason, at } = parsed.data;
      return reason === undefined ? { state, at } : { state, reason, at };
    } catch {
      return { state: 'unknown' };
    }
  }
}
