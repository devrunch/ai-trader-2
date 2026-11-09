import { randomUUID } from 'node:crypto';
import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { CronExpressionParser } from 'cron-parser';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { backoffDelay, retry, sleep, TimeoutError, withTimeout } from '@aitrader/resilience';
import type { AppConfig } from '../config';
import type { HeartbeatSink } from './heartbeat';

export interface JobSpec {
  name: string;
  cron: string;
  tz: string;
  maxRuntimeMs: number;
  graceMs: number;
  run(signal: AbortSignal): Promise<void>;
}
const recordSchema = z.object({ at: z.iso.datetime(), scheduledAt: z.iso.datetime().nullable().default(null),
  outcome: z.enum(['ok', 'failed', 'skipped']) });
type RunRecord = z.infer<typeof recordSchema>;
interface RegisteredJob { spec: JobSpec; queue: Queue; worker: Worker }

export function missedRunDecision(
  lastScheduledAt: Date | null, previousFireAt: Date, now: Date, graceMs: number,
): 'run' | 'skip' | 'none' {
  if (lastScheduledAt && lastScheduledAt >= previousFireAt) return 'none';
  return now.getTime() - previousFireAt.getTime() <= graceMs ? 'run' : 'skip';
}

export function nextFire(cron: string, tz: string, now: Date): string | null {
  try { return CronExpressionParser.parse(cron, { tz, currentDate: now }).next().toDate().toISOString(); }
  catch { return null; }
}

export class JobScheduler implements OnModuleDestroy {
  private readonly logger = new Logger('JobScheduler');
  private readonly jobs = new Map<string, RegisteredJob>();
  private readonly active = new Set<AbortController>();
  private readonly redis: Redis;
  private readonly connection;

  constructor(config: Pick<AppConfig, 'REDIS_URL'>, private readonly sink: HeartbeatSink) {
    this.connection = { url: config.REDIS_URL, maxRetriesPerRequest: null,
      connectTimeout: 3000, retryStrategy: (attempt: number) => backoffDelay(attempt, { baseMs: 200, maxMs: 10000 }) };
    this.redis = new Redis(config.REDIS_URL, { ...this.connection, lazyConnect: true, commandTimeout: 3000 });
    this.redis.on('error', (error: Error) => { this.logger.warn(error.message); });
  }

  async register(spec: JobSpec): Promise<void> {
    const now = new Date();
    const previous = CronExpressionParser.parse(spec.cron, { tz: spec.tz, currentDate: now }).prev().toDate();
    const existing = this.jobs.get(spec.name);
    if (existing) {
      await existing.queue.upsertJobScheduler(spec.name, { pattern: spec.cron, tz: spec.tz });
      existing.spec = spec;
      return;
    }
    const queue = new Queue(spec.name, { prefix: 'jobs', connection: this.connection,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: true } });
    const worker = new Worker<unknown>(spec.name, (delivery) => {
      const payload = z.object({ scheduledAt: z.number().optional() }).parse(delivery.data);
      return this.execute(spec.name, payload.scheduledAt ?? delivery.opts.prevMillis, delivery.id?.startsWith('manual-') ?? false);
    }, {
      prefix: 'jobs', connection: this.connection, concurrency: 1, autorun: false,
    });
    worker.on('error', (error) => { this.logger.warn(error.message); });
    this.jobs.set(spec.name, { spec, queue, worker });
    await queue.upsertJobScheduler(spec.name, { pattern: spec.cron, tz: spec.tz });
    const last = await this.lastRun(spec.name);
    const decision = missedRunDecision(last ? new Date(last.scheduledAt ?? last.at) : null, previous, now, spec.graceMs);
    if (decision === 'run') {
      await queue.add(spec.name, { scheduledAt: previous.getTime() }, {
        jobId: `catchup-${String(previous.getTime())}`, removeOnComplete: true, removeOnFail: true,
      });
    }
    if (decision === 'skip') await this.record(spec.name, 'skipped', previous.getTime());
    void worker.run().catch((error: unknown) => { this.logger.error(error); });
  }

  has(name: string): boolean { return this.jobs.has(name); }

  /** Jobs registered in this process, for the admin view. */
  list(now = new Date()): Array<{ name: string; cron: string; tz: string; next: string | null }> {
    return [...this.jobs.values()].map(({ spec }) => ({ name: spec.name, cron: spec.cron, tz: spec.tz, next: nextFire(spec.cron, spec.tz, now) }));
  }

  async runNow(name: string): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) return;
    // The pending marker deduplicates queued manual triggers across instances.
    if (await this.redis.set(`jobs:${name}:pending`, '1', 'PX', job.spec.maxRuntimeMs + 60000, 'NX') !== 'OK') return;
    await job.queue.add(name, {}, { jobId: `manual-${randomUUID()}`, removeOnComplete: true, removeOnFail: true });
  }

  async lastRun(name: string): Promise<RunRecord | null> {
    const raw = await this.redis.get(`jobs:${name}:last`);
    return raw === null ? null : recordSchema.parse(JSON.parse(raw));
  }

  private async record(name: string, outcome: RunRecord['outcome'], scheduledAt: number | null, detail?: string): Promise<void> {
    await this.redis.set(`jobs:${name}:last`, JSON.stringify({ at: new Date().toISOString(),
      scheduledAt: scheduledAt === null ? null : new Date(scheduledAt).toISOString(), outcome }));
    if (outcome === 'skipped') this.logger.debug({ job: name, outcome });
    await withTimeout(() => this.sink.beat(name, outcome, detail), 3000);
  }

  private async acquireLock(key: string, owner: string, maxRuntimeMs: number, signal: AbortSignal): Promise<void> {
    const busy = new Error('Job lock is held');
    await withTimeout((waitSignal) => retry(async (attempt, retrySignal) => {
      // Fixed lock polling is distinct from dependency-failure backoff.
      if (attempt > 0) await sleep(250, retrySignal);
      if (await this.redis.set(key, owner, 'PX', maxRuntimeMs + 30000, 'NX') !== 'OK') throw busy;
    }, { retries: Math.ceil((maxRuntimeMs + 30000) / 250), baseMs: 0, maxMs: 0,
      retryOn: (error) => error === busy, signal: waitSignal }), maxRuntimeMs + 30000, signal);
  }

  // Lock, occurrence check, callback and record stay in one ownership scope.
  private async execute(name: string, scheduledAt?: number, manual = false): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) return;
    const { spec } = job;
    const key = `jobs:${name}:lock`;
    const owner = randomUUID();
    const controller = new AbortController();
    this.active.add(controller);
    try {
      await this.acquireLock(key, owner, spec.maxRuntimeMs, controller.signal);
      if (manual) await this.redis.del(`jobs:${name}:pending`);
      // Persisted deliveries and startup catch-up share the same scheduled occurrence.
      const last = scheduledAt === undefined ? null : await this.lastRun(name);
      if (last && last.scheduledAt !== null && scheduledAt !== undefined
        && new Date(last.scheduledAt).getTime() >= scheduledAt) return;
      let outcome: RunRecord['outcome'] = 'ok';
      let detail: string | undefined;
      try { await withTimeout((signal) => spec.run(signal), spec.maxRuntimeMs, controller.signal); }
      catch (error) {
        outcome = 'failed';
        detail = error instanceof TimeoutError ? 'timeout' : (error instanceof Error ? error.message : String(error)).slice(0, 200);
      }
      await this.record(name, outcome, scheduledAt ?? null, detail);
    } finally {
      this.active.delete(controller);
      // Compare ownership before deleting so an expired owner cannot release a successor's lock.
      await this.redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, key, owner);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const jobs = [...this.jobs.values()];
    const closed = Promise.all(jobs.map(({ worker }) => worker.close()));
    try { await withTimeout(() => closed, 10000); }
    catch {
      for (const controller of this.active) controller.abort();
      await withTimeout(() => closed, 5000).catch((error: unknown) => { this.logger.warn(error); });
    }
    await Promise.all(jobs.map(({ queue }) => queue.close()));
    this.redis.disconnect();
    this.jobs.clear();
  }
}
