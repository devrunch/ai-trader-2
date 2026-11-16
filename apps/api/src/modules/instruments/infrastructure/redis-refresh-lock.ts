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

const KEY = 'lock:instruments-refresh';
const COMPLETED = 'lock:instruments-refresh:completed';
/** Short, and renewed while the owner is alive: a process killed mid-refresh (a deploy) frees the lock within a minute. */
const LEASE_MS = 60_000;
const RENEW_MS = 20_000;
const POLL_MS = 500;
const RENEW = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";
const RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/** One refresh at a time across processes; a caller that finds one running waits for it (as long as its own signal allows) and gets the same report. */
export class RedisRefreshLock implements RefreshLock {
  private inFlight: Promise<RefreshReport> | undefined;
  constructor(private readonly redis: Redis) {}

  run(work: () => Promise<RefreshReport>, signal: AbortSignal): Promise<RefreshReport> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runDistributed(work, signal).finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }

  private async runDistributed(work: () => Promise<RefreshReport>, signal: AbortSignal): Promise<RefreshReport> {
    const before = await withTimeout(() => this.redis.get(COMPLETED), 1500, signal);
    for (;;) {
      signal.throwIfAborted();
      // A refresh that finished while this caller waited answers it; only then may the caller run one itself.
      const completed = await withTimeout(() => this.redis.get(COMPLETED), 1500, signal);
      if (completed && completed !== before) {
        const cached = await withTimeout(() => this.redis.get(`${KEY}:result:${completed}`), 1500, signal);
        if (cached) return reportSchema.parse(JSON.parse(cached));
      }
      const owner = randomUUID();
      if (await withTimeout(() => this.redis.set(KEY, owner, 'PX', LEASE_MS, 'NX'), 1500, signal) === 'OK') return this.runOwner(owner, work, signal);
      await sleep(POLL_MS, signal);
    }
  }

  private async runOwner(owner: string, work: () => Promise<RefreshReport>, signal: AbortSignal): Promise<RefreshReport> {
    const renew = setInterval(() => { void this.redis.eval(RENEW, 1, KEY, owner, String(LEASE_MS)).catch(() => undefined); }, RENEW_MS);
    renew.unref();
    try {
      const report = await work();
      await withTimeout(() => this.redis.set(`${KEY}:result:${owner}`, JSON.stringify(report), 'EX', 900), 1500, signal);
      await withTimeout(() => this.redis.set(COMPLETED, owner, 'EX', 900), 1500, signal);
      return report;
    } finally {
      clearInterval(renew);
      await withTimeout(() => this.redis.eval(RELEASE, 1, KEY, owner), 1500).catch(() => undefined);
    }
  }
}
