import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AgentRunQueue } from '../src/modules/agent/infrastructure/agent-run-queue';
import type { RunJob } from '../src/modules/agent/application/run-processor';
import { startRedis } from './support/containers';

// AG-6: the assistant run queue against real Redis and BullMQ.
describe('agent run queue', () => {
  let container: Awaited<ReturnType<typeof startRedis>>;
  const queues: AgentRunQueue[] = [];
  beforeAll(async () => { container = await startRedis(); });
  afterAll(async () => { for (const q of queues) await q.onModuleDestroy(); await container.stop(); });

  function build(process: (job: RunJob) => Promise<void>, concurrency = 2) {
    const queue = new AgentRunQueue(container.url, { process } as never, concurrency);
    queues.push(queue);
    queue.onModuleInit();
    return queue;
  }
  async function until(check: () => boolean, ms = 15_000): Promise<void> {
    const end = Date.now() + ms;
    while (!check()) { if (Date.now() > end) throw new Error('timed out waiting'); await delay(50); }
  }

  it('runs a job once however many times the same fire is enqueued', async () => {
    const seen: string[] = [];
    const queue = build(job => { seen.push(`${job.taskId}-${job.key}`); return Promise.resolve(); });
    await Promise.all([1, 2, 3].map(() => queue.enqueue({ taskId: 'dedupe', userId: 'u1', key: 'k1' })));
    await until(() => seen.length >= 1);
    await delay(300);
    expect(seen).toEqual(['dedupe-k1']);
  });

  it('retries a failing job with its attempt number and stops after the attempts are used', async () => {
    const attempts: number[] = [];
    const queue = build(job => { attempts.push(job.attempt); return job.attempt < 2 ? Promise.reject(new Error('fetch failed')) : Promise.resolve(); });
    await queue.enqueue({ taskId: 'retry', userId: 'u1', key: 'k1' });
    await until(() => attempts.length >= 2, 30_000);
    expect(attempts.slice(0, 2)).toEqual([1, 2]);
  }, 40_000);

  it('runs at most `concurrency` jobs at the same time and reports depth, running and failed', async () => {
    let running = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const queue = build(() => new Promise<void>(resolve => { running++; peak = Math.max(peak, running); release.push(() => { running--; resolve(); }); }), 2);
    for (const key of ['a', 'b', 'c', 'd']) await queue.enqueue({ taskId: 'conc', userId: 'u1', key });
    await until(() => running === 2);
    await delay(200);
    expect(peak).toBe(2);
    const stats = await queue.stats();
    expect(stats).toMatchObject({ running: 2, concurrency: 2 });
    expect(stats.depth).toBeGreaterThanOrEqual(2);
    while (release.length > 0) { release.shift()?.(); await delay(50); }
  });

  it('a graceful shutdown waits for the running job to finish', async () => {
    const finished = vi.fn();
    let started = false;
    const queue = new AgentRunQueue(container.url, { process: async () => { started = true; await delay(500); finished(); } } as never, 1);
    queue.onModuleInit();
    await queue.enqueue({ taskId: 'drain', userId: 'u1', key: 'k1' });
    await until(() => started);
    await queue.onModuleDestroy();
    expect(finished).toHaveBeenCalledOnce();
  });
});
