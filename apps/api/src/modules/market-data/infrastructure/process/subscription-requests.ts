import type { Redis } from 'ioredis';
import { z } from 'zod';

const changeSchema = z.object({ instrumentId: z.string(), count: z.number().int().nonnegative() });
export class SubscriptionRequests {
  private readonly subscriber: Redis;
  private readonly redis: Redis;
  private readonly listeners = new Set<(instrumentId: string, count: number) => void>();
  private ready: Promise<void>;
  constructor(redis: Redis) {
    this.redis = redis;
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
      if (parsed.success) for (const listener of this.listeners) listener(parsed.data.instrumentId, parsed.data.count);
    });
  }
  async current(): Promise<Map<string, number>> {
    await this.ready;
    const entries = await this.redis.hgetall('md:subs');
    const values: Array<readonly [string, number]> = [];
    for (const [id, raw] of Object.entries(entries)) {
      const count = Number(raw);
      if (Number.isFinite(count) && count > 0) values.push([id, count]);
    }
    return new Map(values);
  }
  onChange(cb: (instrumentId: string, count: number) => void): () => void {
    this.listeners.add(cb); void this.ready; return () => { this.listeners.delete(cb); };
  }
  close(): void { this.listeners.clear(); this.subscriber.disconnect(); }
}
