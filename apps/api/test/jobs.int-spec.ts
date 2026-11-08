import { setTimeout as delay } from 'node:timers/promises';
import { Redis } from 'ioredis';
import { Queue, QueueEvents } from 'bullmq';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_SINK, JobScheduler, JobSchedulerModule, type JobSpec, type HeartbeatSink } from '../src/shared/jobs';
import { AppConfigModule, loadConfig } from '../src/shared/config';
import { startRedis } from './support/containers';

// NFR-RB-4/5, E22, E25: durable scheduling against real Redis.
describe('durable jobs', () => {
  let container: Awaited<ReturnType<typeof startRedis>>;
  let redis: Redis;
  const instances: JobScheduler[] = [];
  const beat = vi.fn<HeartbeatSink['beat']>()
    .mockResolvedValue(undefined);
  let sequence = 0;
  function scheduler() {
    const instance = new JobScheduler({ REDIS_URL: container.url }, { beat });
    instances.push(instance);
    return instance;
  }
  function spec(run: JobSpec['run'], overrides: Partial<JobSpec> = {}): JobSpec {
    return { name: `test-${String(++sequence)}`, cron: '0 0 1 1 *', tz: 'Asia/Kolkata',
      maxRuntimeMs: 5000, graceMs: 0, run, ...overrides };
  }
  beforeAll(async () => { container = await startRedis(); redis = new Redis(container.url); });
  afterEach(async () => {
    await Promise.all(instances.splice(0).map((instance) => instance.onModuleDestroy()));
    beat.mockClear();
  });
  afterAll(async () => { redis.disconnect(); await container.stop(); });

  it('runs a registered job on schedule', async () => {
    const run = vi.fn<JobSpec['run']>().mockResolvedValue(undefined);
    const module = await Test.createTestingModule({ imports: [
      AppConfigModule.forRoot(loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://localhost/test', REDIS_URL: container.url })),
      JobSchedulerModule,
    ] }).overrideProvider(HEARTBEAT_SINK).useValue({ beat }).compile();
    const instance = module.get<JobScheduler>(JobScheduler);
    instances.push(instance);
    await instance.register(spec(run, { cron: '*/1 * * * * *' }));
    await expect.poll(() => run.mock.calls.length, { timeout: 3000 }).toBeGreaterThan(0);
  });
  it('never runs two copies of one job', async () => {
    let active = 0; let maximum = 0;
    const job = spec(async () => { maximum = Math.max(maximum, ++active); await delay(1500); active--; });
    const first = scheduler(); const second = scheduler();
    await first.register(job); await second.register(job);
    await Promise.all([first.runNow(job.name), second.runNow(job.name)]);
    await expect.poll(() => maximum).toBe(1);
    // A distinct delivery bypasses immediate-ID deduplication and exercises the Redis lock.
    const queue = new Queue(job.name, { prefix: 'jobs', connection: { url: container.url } });
    await queue.add(job.name, {}, { jobId: 'concurrent-delivery' });
    await queue.close();
    await delay(1700);
    expect(maximum).toBe(1);
  });
  it('aborts a job at maxRuntimeMs', async () => {
    let aborted = false;
    const job = spec((signal) => new Promise(() => {
      signal.addEventListener('abort', () => { aborted = true; });
    }), { maxRuntimeMs: 100 });
    const instance = scheduler(); await instance.register(job); await instance.runNow(job.name);
    await expect.poll(() => instance.lastRun(job.name)).toMatchObject({ outcome: 'failed' });
    expect(aborted).toBe(true);
    expect(beat).toHaveBeenCalledWith(job.name, 'failed', 'timeout');
  });
  it('a throwing job records failed and the next run still happens', async () => {
    const run = vi.fn<JobSpec['run']>().mockRejectedValueOnce(new Error('broken')).mockResolvedValue(undefined);
    const job = spec(run); const instance = scheduler(); await instance.register(job);
    await instance.runNow(job.name);
    await vi.waitFor(async () => {
      expect(await instance.lastRun(job.name)).toMatchObject({ outcome: 'failed', scheduledAt: null });
    }, { timeout: 10000 });
    expect(beat).toHaveBeenCalledWith(job.name, 'failed', 'broken');
    await instance.runNow(job.name);
    await vi.waitFor(async () => {
      expect(await instance.lastRun(job.name)).toMatchObject({ outcome: 'ok', scheduledAt: null });
    }, { timeout: 10000 });
  });
  it('a late-finishing run does not suppress the next scheduled occurrence', async () => {
    let runs = 0; let completed = 0;
    const job = spec(async () => { if (++runs === 1) await delay(1500); }, { cron: '*/1 * * * * *' });
    const events = new QueueEvents(job.name, { prefix: 'jobs', connection: { url: container.url } });
    events.on('completed', () => { completed++; });
    try {
      await events.waitUntilReady();
      await scheduler().register(job);
      await vi.waitFor(() => { expect(completed).toBeGreaterThanOrEqual(2); }, { timeout: 10000 });
      // A completed delivery must invoke the job, even when the preceding run finished late.
      expect(runs).toBeGreaterThanOrEqual(2);
      expect(runs).toBeGreaterThanOrEqual(completed);
    } finally { await events.close(); }
  });
  it('catches up a run missed within grace after restart', async () => {
    const run = vi.fn<JobSpec['run']>().mockResolvedValue(undefined);
    const job = spec(run, { cron: '* * * * *', graceMs: 120000 });
    await redis.set(`jobs:${job.name}:last`, JSON.stringify({ at: '2020-01-01T00:00:00Z', outcome: 'ok' }));
    // A scheduled delivery may already be persisted when the process restarts.
    const queue = new Queue(job.name, { prefix: 'jobs', connection: { url: container.url } });
    await queue.add(job.name, {}, { prevMillis: Math.floor(Date.now() / 60000) * 60000 });
    await queue.close();
    const first = scheduler(); await first.register(job);
    await expect.poll(() => run.mock.calls.length).toBe(1);
    await first.onModuleDestroy(); instances.splice(instances.indexOf(first), 1);
    await scheduler().register(job); await delay(100);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('reads legacy run records with a null scheduled occurrence', async () => {
    const job = spec(async () => {}); const instance = scheduler();
    await redis.set(`jobs:${job.name}:last`, JSON.stringify({ at: '2020-01-01T00:00:00Z', outcome: 'ok' }));
    expect(await instance.lastRun(job.name)).toEqual({ at: '2020-01-01T00:00:00Z', scheduledAt: null, outcome: 'ok' });
  });
  it('catches up the next occurrence even when the previous run finished after it', async () => {
    const run = vi.fn<JobSpec['run']>().mockResolvedValue(undefined);
    const job = spec(run, { cron: '* * * * *', graceMs: 120000 });
    const previous = Math.floor(Date.now() / 60000) * 60000;
    await redis.set(`jobs:${job.name}:last`, JSON.stringify({ at: new Date(previous + 30000).toISOString(),
      scheduledAt: new Date(previous - 60000).toISOString(), outcome: 'ok' }));
    const instance = scheduler(); await instance.register(job);
    await vi.waitFor(() => { expect(run).toHaveBeenCalled(); }, { timeout: 10000 });
    await vi.waitFor(async () => {
      const last = await instance.lastRun(job.name);
      expect(last?.scheduledAt).not.toBeNull();
      expect(new Date(last?.scheduledAt ?? '').getTime()).toBeGreaterThanOrEqual(previous);
    }, { timeout: 10000 });
  });
  it('skips a run missed beyond grace and heartbeats skipped', async () => {
    const run = vi.fn<JobSpec['run']>().mockResolvedValue(undefined);
    const job = spec(run); const instance = scheduler(); await instance.register(job);
    expect(await instance.lastRun(job.name)).toMatchObject({ outcome: 'skipped' });
    expect(beat).toHaveBeenCalledWith(job.name, 'skipped', undefined);
    expect(run).not.toHaveBeenCalled();
  });
  it('re-registering the same job does not duplicate it', async () => {
    const job = spec(async () => {}); const instance = scheduler();
    await instance.register(job); await instance.register({ ...job, cron: '0 1 1 1 *' });
    const queue = new Queue(job.name, { prefix: 'jobs', connection: { url: container.url } });
    try {
      const schedules = await queue.getJobSchedulers();
      expect(schedules).toHaveLength(1); expect(schedules[0]?.pattern).toBe('0 1 1 1 *');
    } finally { await queue.close(); }
  });
  it('runNow while a run is active is a no-op', async () => {
    let release = () => {};
    const run = vi.fn<JobSpec['run']>().mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    const job = spec(run); const instance = scheduler(); await instance.register(job);
    await instance.runNow(job.name); await expect.poll(() => run.mock.calls.length).toBe(1);
    await instance.runNow(job.name); release(); await delay(150);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
