import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { SECOND_INTERVALS } from '@aitrader/contracts';
import type { SecondInterval } from '../domain/interval';
import type { SecondsDemand, SecondsLeases } from '../application/ports/seconds-store';

const KEY = 'md:ssubs';
const isSecond = (value: string): value is SecondInterval => (SECOND_INTERVALS as readonly string[]).includes(value);

/** API side: a lease per watched (instrument, seconds interval), refreshed while held and expiring on its own. */
export class RedisSecondsLeases implements SecondsLeases {
  private readonly held = new Set<string>();
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(private readonly redis: Redis, private readonly instanceId: string, private readonly leaseMs = 60_000, private readonly clock: () => number = Date.now) {
    const logger = new Logger(RedisSecondsLeases.name);
    this.timer = setInterval(() => { void this.refresh().catch(() => { logger.warn('Seconds lease refresh failed'); }); }, 20_000);
  }
  async add(instrumentId: string, interval: SecondInterval): Promise<void> {
    const member = this.member(instrumentId, interval);
    this.held.add(member);
    await this.redis.zadd(KEY, this.clock() + this.leaseMs, member);
  }
  async remove(instrumentId: string, interval: SecondInterval): Promise<void> {
    const member = this.member(instrumentId, interval);
    this.held.delete(member);
    await this.redis.zrem(KEY, member);
  }
  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    const members = [...this.held]; this.held.clear();
    if (members.length) await this.redis.zrem(KEY, ...members).catch(() => undefined);
  }
  private async refresh(): Promise<void> {
    const expiry = this.clock() + this.leaseMs;
    for (const member of this.held) await this.redis.zadd(KEY, expiry, member);
  }
  private member(instrumentId: string, interval: SecondInterval): string { return `${this.instanceId}|${instrumentId}|${interval}`; }
}

/** Market-data side: the unexpired leases of every API instance. */
export class RedisSecondsDemand implements SecondsDemand {
  constructor(private readonly redis: Redis, private readonly clock: () => number = Date.now) {}
  async active(): Promise<Array<{ instrumentId: string; interval: SecondInterval }>> {
    await this.redis.zremrangebyscore(KEY, '-inf', this.clock());
    const unique = new Map<string, { instrumentId: string; interval: SecondInterval }>();
    for (const member of await this.redis.zrangebyscore(KEY, this.clock(), '+inf')) {
      const [, instrumentId, interval] = member.split('|');
      if (instrumentId && interval && isSecond(interval)) unique.set(`${instrumentId}|${interval}`, { instrumentId, interval });
    }
    return [...unique.values()];
  }
}
