import { describe, expect, it, vi } from 'vitest';
import { AgentRunQueue, RUN_ATTEMPTS, type BullFactory } from './agent-run-queue';

function fakes() {
  const events: string[] = [];
  const added: Array<{ name: string; data: unknown; opts: { jobId?: string } }> = [];
  const known = new Set<string>();
  let handler: ((job: { data: unknown; attemptsMade: number; opts: { attempts?: number } }) => Promise<void>) | undefined;
  let release: (() => void) | undefined;
  const worker = { on: vi.fn(), close: vi.fn(async (force?: boolean) => { events.push(force ? 'worker.force' : 'worker.close'); if (!force && release) await new Promise<void>(r => { release = r; }); }) };
  const queue = { add: vi.fn((name: string, data: unknown, opts: { jobId?: string }) => { if (opts.jobId && known.has(opts.jobId)) return Promise.resolve(null); if (opts.jobId) known.add(opts.jobId); added.push({ name, data, opts }); return Promise.resolve({}); }),
    getJobCounts: vi.fn().mockResolvedValue({ waiting: 3, delayed: 2, active: 1, failed: 4 }), close: vi.fn(() => { events.push('queue.close'); return Promise.resolve(); }) };
  let queueOptions: { defaultJobOptions: Record<string, unknown> } | undefined;
  let workerOptions: { concurrency: number } | undefined;
  const factory: BullFactory = { queue: (_n, o) => { queueOptions = o as never; return queue; },
    worker: (_n, process, o) => { handler = process; workerOptions = o; return worker; } };
  return { factory, queue, worker, added, events, handler: () => handler, queueOptions: () => queueOptions, workerOptions: () => workerOptions, hang: () => { release = () => undefined; } };
}
const processor = () => ({ process: vi.fn().mockResolvedValue(undefined) });

describe('AgentRunQueue', () => {
  it('enqueues a fire under taskId-key, so the same fire twice is one job', async () => {
    const f = fakes();
    const queue = new AgentRunQueue('redis://x', processor() as never, 2, f.factory);
    await queue.enqueue({ taskId: 't1', userId: 'u1', key: 'abc' });
    await queue.enqueue({ taskId: 't1', userId: 'u1', key: 'abc' });
    await queue.enqueue({ taskId: 't1', userId: 'u1', key: 'def' });
    expect(f.added.map(a => a.opts.jobId)).toEqual(['t1-abc', 't1-def']);
    expect(f.added[0]?.data).toEqual({ taskId: 't1', userId: 'u1', key: 'abc' });
  });

  it('keeps recent jobs for dedupe and for the failed-last-24h count, and retries twice with backoff', () => {
    const f = fakes();
    new AgentRunQueue('redis://x', processor() as never, 2, f.factory);
    expect(f.queueOptions()?.defaultJobOptions).toMatchObject({ attempts: RUN_ATTEMPTS, backoff: { type: 'exponential' }, removeOnComplete: { age: 3600 }, removeOnFail: { age: 86_400 } });
    expect(RUN_ATTEMPTS).toBe(3);
  });

  it('the worker runs the processor with the attempt number, at the configured concurrency', async () => {
    const f = fakes();
    const p = processor();
    const queue = new AgentRunQueue('redis://x', p as never, 3, f.factory);
    queue.onModuleInit();
    expect(f.workerOptions()?.concurrency).toBe(3);
    await f.handler()?.({ data: { taskId: 't1', userId: 'u1', key: 'k' }, attemptsMade: 1, opts: { attempts: 3 } });
    expect(p.process).toHaveBeenCalledWith({ taskId: 't1', userId: 'u1', key: 'k', attempt: 2, attempts: 3 });
    await expect(f.handler()?.({ data: { nope: 1 }, attemptsMade: 0, opts: {} })).rejects.toThrow();
  });

  it('reports depth, running and failed-last-24h for the admin', async () => {
    const f = fakes();
    expect(await new AgentRunQueue('redis://x', processor() as never, 2, f.factory).stats()).toEqual({ depth: 5, running: 1, failed24h: 4, concurrency: 2 });
  });

  it('shuts down by letting the worker drain first, then closing the queue', async () => {
    const f = fakes();
    const queue = new AgentRunQueue('redis://x', processor() as never, 2, f.factory);
    queue.onModuleInit();
    await queue.onModuleDestroy();
    expect(f.events).toEqual(['worker.close', 'queue.close']);
  });

  it('forces the worker closed when it does not drain in time, so the queue picks the job up again elsewhere', async () => {
    vi.useFakeTimers();
    try {
      const f = fakes();
      f.hang();
      const queue = new AgentRunQueue('redis://x', processor() as never, 2, f.factory);
      queue.onModuleInit();
      const done = queue.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(31_000);
      await done;
      expect(f.events).toEqual(['worker.close', 'worker.force', 'queue.close']);
    } finally { vi.useRealTimers(); }
  });
});
