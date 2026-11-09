import type { ProviderReason } from '@aitrader/contracts';
import type { Redis } from 'ioredis';
import type { FeedState } from '../../application/ports/live-feed';
import type { FeedVendor } from '../../application/ports/feed-state-store';
import { feedStateKey } from '../feed-state.store';

export class FeedStatePublisher {
  constructor(private readonly redis: Redis, private readonly clock: () => number = Date.now, private readonly log?: (vendor: FeedVendor, state: FeedState, reason?: ProviderReason) => void) {}
  async publish(vendor: FeedVendor, state: FeedState, reason?: ProviderReason, detail?: string): Promise<void> {
    const record = { state, ...(reason === undefined ? {} : { reason }), ...(detail === undefined ? {} : { detail }), at: this.clock() };
    await this.redis.set(feedStateKey(vendor), JSON.stringify(record), 'PX', 60000);
    this.log?.(vendor, state, reason);
  }
}
