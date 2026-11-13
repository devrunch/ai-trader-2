import type { Redis } from 'ioredis';
/** How many units may still be spent today; granting counts them. */
export interface DailyBudget { take(count: number): Promise<number> }

/** A daily cap counted in Redis per UTC day so every process shares it; the counter expires on its own. */
export class RedisDailyBudget implements DailyBudget {
  constructor(private readonly redis: Redis, private readonly name: string, private readonly cap: number, private readonly now: () => number = Date.now) {}

  async take(count: number): Promise<number> {
    if (count <= 0 || this.cap <= 0) return 0;
    const key = `${this.name}:${new Date(this.now()).toISOString().slice(0, 10)}`;
    const total = await this.redis.incrby(key, count);
    if (total === count) await this.redis.expire(key, 2 * 86_400);
    return Math.max(0, Math.min(count, this.cap - (total - count)));
  }
}
