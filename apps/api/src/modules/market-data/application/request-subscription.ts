import type { Redis } from 'ioredis';

export class RequestSubscription {
  constructor(private readonly redis: Redis) {}
  async acquire(instrumentId: string): Promise<void> {
    const count = await this.redis.hincrby('md:subs', instrumentId, 1);
    await this.redis.publish('md:subs:changed', JSON.stringify({ instrumentId, count }));
  }
  async release(instrumentId: string): Promise<void> {
    const count = await this.redis.hincrby('md:subs', instrumentId, -1);
    if (count <= 0) { await this.redis.hdel('md:subs', instrumentId); }
    await this.redis.publish('md:subs:changed', JSON.stringify({ instrumentId, count: Math.max(0, count) }));
  }
}
