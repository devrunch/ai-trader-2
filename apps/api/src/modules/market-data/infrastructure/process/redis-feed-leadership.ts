import type { Redis } from 'ioredis';
import type { FeedLeadership } from '../../application/ports/feed-leadership';

// md:leader holds the leader's instance id with a PX lease; md:subs is a ZSET of `<instance>|<instrument>` scored by lease expiry.
export class RedisFeedLeadership implements FeedLeadership {
  constructor(private readonly redis: Redis, private readonly clock: () => number = Date.now) {}

  async leader(): Promise<{ instanceId: string; ttlMs: number } | null> {
    const [instanceId, ttlMs] = await Promise.all([this.redis.get('md:leader'), this.redis.pttl('md:leader')]);
    return instanceId === null ? null : { instanceId, ttlMs: Math.max(0, ttlMs) };
  }

  async subscriptions(): Promise<Array<{ instrumentId: string; count: number }>> {
    const members = await this.redis.zrangebyscore('md:subs', this.clock(), '+inf');
    const counts = new Map<string, number>();
    for (const member of members) {
      const instrumentId = member.slice(member.indexOf('|') + 1);
      counts.set(instrumentId, (counts.get(instrumentId) ?? 0) + 1);
    }
    return [...counts].map(([instrumentId, count]) => ({ instrumentId, count })).sort((a, b) => a.instrumentId.localeCompare(b.instrumentId));
  }
}
