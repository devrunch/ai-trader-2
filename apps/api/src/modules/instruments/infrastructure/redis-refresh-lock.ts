import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { sleep, withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { RefreshReport } from '../application/refresh-instruments.js';
import type { RefreshLock } from '../application/ports/refresh-lock.js';

const sourceReportSchema = z.object({ status: z.enum(['ok', 'stale']), count: z.number(),
  changes: z.object({ listed: z.number(), renamed: z.number(), delisted: z.number(), expired: z.number(), updated: z.number() }), reason: z.string().optional() })
  .transform(({ reason, ...source }) => reason === undefined ? source : { ...source, reason });
const reportSchema = z.object({ sources: z.record(z.string(), sourceReportSchema) });

export class RedisRefreshLock implements RefreshLock {
  private inFlight: Promise<RefreshReport> | undefined;
  constructor(private readonly redis: Redis, private readonly now: () => number = Date.now) {}

  run(work: () => Promise<RefreshReport>, signal: AbortSignal): Promise<RefreshReport> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runDistributed(work, signal).finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }

  private async runDistributed(work: () => Promise<RefreshReport>, signal: AbortSignal): Promise<RefreshReport> {
    const deadline = this.now() + 60000;
    let sawOwner = false;
    while (this.now() < deadline) {
      signal.throwIfAborted();
      if (!sawOwner) {
        const owner = randomUUID();
        const acquired = await withTimeout(() => this.redis.set('lock:instruments-refresh', owner, 'PX', 900000, 'NX'), 1500, signal);
        if (acquired === 'OK') return this.runOwner(owner, work, signal);
        sawOwner = true;
      }
      const current = await withTimeout(() => this.redis.get('lock:instruments-refresh'), 1500, signal);
      if (current) {
        const cached = await withTimeout(() => this.redis.get(`lock:instruments-refresh:result:${current}`), 1500, signal);
        if (cached) return reportSchema.parse(JSON.parse(cached));
      } else {
        const completed = await withTimeout(() => this.redis.get('lock:instruments-refresh:completed'), 1500, signal);
        if (completed) {
          const cached = await withTimeout(() => this.redis.get(`lock:instruments-refresh:result:${completed}`), 1500, signal);
          if (cached) return reportSchema.parse(JSON.parse(cached));
        }
      }
      await sleep(100, signal);
    }
    throw new Error('Instrument refresh lock wait timed out');
  }

  private async runOwner(owner: string, work: () => Promise<RefreshReport>, signal: AbortSignal): Promise<RefreshReport> {
    try {
      const report = await work();
      await withTimeout(() => this.redis.set(`lock:instruments-refresh:result:${owner}`, JSON.stringify(report), 'EX', 900), 1500, signal);
      await withTimeout(() => this.redis.set('lock:instruments-refresh:completed', owner, 'EX', 900), 1500, signal);
      return report;
    } finally {
      await withTimeout(() => this.redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1,
        'lock:instruments-refresh', owner), 1500, signal);
    }
  }
}
