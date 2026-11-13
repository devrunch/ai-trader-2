import type { Redis } from 'ioredis';

export interface SourceHealthRecord {
  lastSuccessAt: string | null; lastError: string | null; lastErrorAt: string | null; lastLatencyMs: number | null;
  /** Items received in the last 24 hours. */ items24h: number;
  /** Times the rate limit made a call wait or fail in the last 24 hours. */ rateLimitHits24h: number;
}
const EMPTY: SourceHealthRecord = { lastSuccessAt: null, lastError: null, lastErrorAt: null, lastLatencyMs: null, items24h: 0, rateLimitHits24h: 0 };

/** What every call records, per source: the admin "Data sources" view reads it. */
export interface SourceHealth {
  success(id: string, info: { items: number; latencyMs: number }): Promise<void>;
  /** Adds parsed items to the 24-hour count without touching latency or the last-success time. */
  items(id: string, count: number): Promise<void>;
  failure(id: string, message: string): Promise<void>;
  rateLimited(id: string): Promise<void>;
  read(ids: string[]): Promise<Record<string, SourceHealthRecord>>;
}

const DAY_S = 86_400;
const hourBucket = (now: number): number => Math.floor(now / 3_600_000);

/** Redis: one hash per source for the latest values, plus hourly counters (kept 25 h) for the 24-hour sums. Recording never throws. */
export class RedisSourceHealth implements SourceHealth {
  constructor(private readonly redis: Redis, private readonly now: () => number = Date.now) {}

  async success(id: string, info: { items: number; latencyMs: number }): Promise<void> {
    await this.safely(async () => {
      const t = this.now();
      await this.redis.multi().hset(`source:${id}`, { lastSuccessAt: new Date(t).toISOString(), lastLatencyMs: String(info.latencyMs) })
        .incrby(`source:${id}:items:${String(hourBucket(t))}`, info.items).expire(`source:${id}:items:${String(hourBucket(t))}`, DAY_S + 3600).exec();
    });
  }

  async items(id: string, count: number): Promise<void> {
    await this.safely(async () => {
      const key = `source:${id}:items:${String(hourBucket(this.now()))}`;
      await this.redis.multi().incrby(key, count).expire(key, DAY_S + 3600).exec();
    });
  }

  async failure(id: string, message: string): Promise<void> {
    await this.safely(() => this.redis.hset(`source:${id}`, { lastError: message.slice(0, 300), lastErrorAt: new Date(this.now()).toISOString() }));
  }

  async rateLimited(id: string): Promise<void> {
    await this.safely(async () => {
      const key = `source:${id}:limited:${String(hourBucket(this.now()))}`;
      await this.redis.multi().incr(key).expire(key, DAY_S + 3600).exec();
    });
  }

  async read(ids: string[]): Promise<Record<string, SourceHealthRecord>> {
    const out: Record<string, SourceHealthRecord> = {};
    const hour = hourBucket(this.now());
    for (const id of ids) {
      try {
        const hash = await this.redis.hgetall(`source:${id}`);
        const sum = async (kind: 'items' | 'limited'): Promise<number> => {
          const values = await this.redis.mget(Array.from({ length: 24 }, (_, i) => `source:${id}:${kind}:${String(hour - i)}`));
          return values.reduce((total, v) => total + (v ? Number(v) : 0), 0);
        };
        out[id] = { lastSuccessAt: hash['lastSuccessAt'] ?? null, lastError: hash['lastError'] ?? null, lastErrorAt: hash['lastErrorAt'] ?? null,
          lastLatencyMs: hash['lastLatencyMs'] === undefined ? null : Number(hash['lastLatencyMs']), items24h: await sum('items'), rateLimitHits24h: await sum('limited') };
      } catch { out[id] = { ...EMPTY }; }
    }
    return out;
  }

  private async safely(work: () => Promise<unknown>): Promise<void> {
    try { await work(); } catch { /* health is advisory: a Redis hiccup must not fail a fetch */ }
  }
}
