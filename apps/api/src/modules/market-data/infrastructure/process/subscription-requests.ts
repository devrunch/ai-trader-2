import type { Redis } from 'ioredis';
import { z } from 'zod';
import { Logger } from '@nestjs/common';

const changeSchema = z.object({ instrumentId: z.string() });
export class SubscriptionRequests {
  private readonly subscriber: Redis;
  private readonly redis: Redis;
  private readonly listeners = new Set<(instrumentId: string, count: number) => void>();
  private ready: Promise<void>;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  private readonly warn: (message: string) => void;
  constructor(redis: Redis, warn?: (message: string) => void) {
    this.redis = redis;
    const logger = new Logger(SubscriptionRequests.name);
    this.warn = warn ?? (message => { logger.warn(message); });
    this.subscriber = redis.duplicate();
    this.ready = new Promise<void>((resolve, reject) => {
      const subscribe = () => { void this.subscriber.subscribe('md:subs:changed').then(() => { resolve(); }, reject); };
      if (this.subscriber.status === 'ready') subscribe();
      else if (this.subscriber.status === 'wait') void this.subscriber.connect().then(subscribe, reject);
      else this.subscriber.once('ready', subscribe);
    });
    this.subscriber.on('message', (_channel, message) => {
      let value: unknown;
      try { value = JSON.parse(message); } catch { return; }
      const parsed = changeSchema.safeParse(value);
      if (parsed.success) void this.notify(parsed.data.instrumentId).catch((error: unknown) => { this.warn(`Subscription notification failed: ${errorName(error)}`); });
    });
    this.cleanupTimer = setInterval(() => { void this.cleanup().catch((error: unknown) => { this.warn(`Subscription cleanup failed: ${errorName(error)}`); }); }, 20_000);
  }
  private lastKnown = new Set<string>();
  async current(): Promise<Map<string, number>> {
    await this.ready;
    await this.redis.zremrangebyscore('md:subs', '-inf', Date.now());
    const members = await this.redis.zrangebyscore('md:subs', Date.now(), '+inf');
    const ids = new Set(members.map(member => member.slice(member.indexOf('|') + 1)));
    this.lastKnown = ids;
    return new Map([...ids].map(id => [id, 1]));
  }
  onChange(cb: (instrumentId: string, count: number) => void): () => void {
    this.listeners.add(cb); void this.ready; return () => { this.listeners.delete(cb); };
  }
  close(): void { clearInterval(this.cleanupTimer); this.listeners.clear(); this.subscriber.disconnect(); }
  private async notify(instrumentId: string): Promise<void> {
    const count = (await this.current()).get(instrumentId) ?? 0;
    if (count) this.lastKnown.add(instrumentId); else this.lastKnown.delete(instrumentId);
    for (const listener of this.listeners) listener(instrumentId, count);
  }
  private async cleanup(): Promise<void> {
    const current = await this.current();
    const active = new Set(current.keys());
    for (const id of new Set([...this.lastKnown, ...active])) {
      const count = active.has(id) ? 1 : 0;
      if (this.lastKnown.has(id) !== active.has(id)) for (const listener of this.listeners) listener(id, count);
    }
    this.lastKnown = active;
  }
}

function errorName(error: unknown): string { return error instanceof Error ? error.name : 'UnknownError'; }
