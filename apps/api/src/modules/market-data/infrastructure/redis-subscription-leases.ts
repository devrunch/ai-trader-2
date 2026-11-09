import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { SubscriptionLeases } from '../application/ports/subscription-leases';

interface LeaseOptions { leaseMs?: number; refreshMs?: number; clock?: () => number; warn?: (message: string) => void }

export class RedisSubscriptionLeases implements SubscriptionLeases {
  private readonly instruments = new Set<string>();
  private readonly leaseMs: number;
  private readonly clock: () => number;
  private readonly warn: (message: string) => void;
  private readonly refreshTimer: ReturnType<typeof setInterval>;
  constructor(private readonly redis: Redis, private readonly instanceId: string, options: LeaseOptions = {}) {
    this.leaseMs = options.leaseMs ?? 60_000;
    this.clock = options.clock ?? Date.now;
    const logger = new Logger(RedisSubscriptionLeases.name);
    this.warn = options.warn ?? (message => { logger.warn(message); });
    this.refreshTimer = setInterval(() => { void this.refresh().catch((error: unknown) => { this.warn(`Lease refresh failed: ${errorName(error)}`); }); }, options.refreshMs ?? 20_000);
  }
  async add(instrumentId: string): Promise<void> {
    this.instruments.add(instrumentId);
    await this.redis.zadd('md:subs', this.clock() + this.leaseMs, this.member(instrumentId));
    await this.publish(instrumentId);
  }
  async remove(instrumentId: string): Promise<void> {
    this.instruments.delete(instrumentId);
    await this.redis.zrem('md:subs', this.member(instrumentId));
    await this.publish(instrumentId);
  }
  async removeAll(): Promise<void> {
    clearInterval(this.refreshTimer);
    const ids = [...this.instruments];
    this.instruments.clear();
    if (ids.length) await this.redis.zrem('md:subs', ...ids.map(id => this.member(id)));
    for (const id of ids) await this.publish(id);
  }
  async onModuleDestroy(): Promise<void> {
    try { await this.removeAll(); }
    catch (error) { this.warn(`Lease cleanup failed: ${errorName(error)}`); }
  }
  private async refresh(): Promise<void> {
    const expiry = this.clock() + this.leaseMs;
    for (const id of this.instruments) await this.redis.zadd('md:subs', expiry, this.member(id));
  }
  private member(instrumentId: string): string { return `${this.instanceId}|${instrumentId}`; }
  private async publish(instrumentId: string): Promise<void> {
    await this.redis.publish('md:subs:changed', JSON.stringify({ instrumentId }));
  }
}

function errorName(error: unknown): string { return error instanceof Error ? error.name : 'UnknownError'; }
