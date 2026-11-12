import { Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { z } from 'zod';
import { backoffDelay, withTimeout } from '@aitrader/resilience';
import type { AgentQueueStats } from '@aitrader/contracts';
import type { RunProcessor } from '../application/run-processor';
import type { RunQueue } from '../application/run-queue';

const NAME = 'agent-run';
export const RUN_ATTEMPTS = 3;
const payload = z.object({ taskId: z.string(), userId: z.string(), key: z.string() });
const DRAIN_MS = 30_000;

interface Handle { add(name: string, data: unknown, opts: object): Promise<unknown>; getJobCounts(...types: string[]): Promise<Record<string, number>>; close(): Promise<void> }
interface WorkerHandle { on(event: 'error', fn: (e: Error) => void): unknown; close(force?: boolean): Promise<void> }
export interface BullFactory {
  queue(name: string, options: { prefix: string; connection: ConnectionOptions; defaultJobOptions: object }): Handle;
  worker(name: string, process: (job: { data: unknown; attemptsMade: number; opts: { attempts?: number | undefined } }) => Promise<void>, options: { prefix: string; connection: ConnectionOptions; concurrency: number; maxStalledCount: number }): WorkerHandle;
}
const bull: BullFactory = {
  queue: (name, options) => new Queue(name, options),
  worker: (name, process, options) => new Worker(name, process, options),
};

/**
 * Assistant and desk runs fired by background tasks (AG-6), on Redis through BullMQ like the scheduled jobs. A job runs on any instance, `concurrency` at a time;
 * a failure that may pass is retried with backoff (3 attempts in all); a job whose worker died is picked up again by the queue's stalled-job check.
 */
export class AgentRunQueue implements RunQueue, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AgentRunQueue');
  private readonly queue: Handle;
  private worker: WorkerHandle | undefined;
  private readonly connection: ConnectionOptions;

  constructor(redisUrl: string, private readonly processor: RunProcessor, private readonly concurrency: number, private readonly factory: BullFactory = bull) {
    this.connection = { url: redisUrl, maxRetriesPerRequest: null, connectTimeout: 3000, retryStrategy: (attempt: number) => backoffDelay(attempt, { baseMs: 200, maxMs: 10_000 }) };
    this.queue = this.factory.queue(NAME, { prefix: 'agent', connection: this.connection, defaultJobOptions: {
      attempts: RUN_ATTEMPTS, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: { age: 3600 }, removeOnFail: { age: 86_400 } } });
  }

  onModuleInit(): void {
    this.worker = this.factory.worker(NAME, async job => {
      const data = payload.parse(job.data);
      await this.processor.process({ ...data, attempt: job.attemptsMade + 1, attempts: job.opts.attempts ?? RUN_ATTEMPTS });
    }, { prefix: 'agent', connection: this.connection, concurrency: this.concurrency, maxStalledCount: 2 });
    this.worker.on('error', error => { this.logger.warn(error.message); });
  }

  async enqueue(job: { taskId: string; userId: string; key: string }): Promise<void> {
    // The job id carries the fire key: adding the same fire again is ignored by the queue while the first is still known to it.
    await this.queue.add(NAME, job, { jobId: `${job.taskId}-${job.key}` });
  }

  async stats(): Promise<AgentQueueStats> {
    const counts = await this.queue.getJobCounts('waiting', 'delayed', 'active', 'failed');
    return { depth: (counts['waiting'] ?? 0) + (counts['delayed'] ?? 0), running: counts['active'] ?? 0, failed24h: counts['failed'] ?? 0, concurrency: this.concurrency };
  }

  /** Stop taking jobs, let the running ones finish (up to 30 s; a job cut off then is picked up again by another worker), then close the queue. */
  async onModuleDestroy(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    if (worker) {
      try { await withTimeout(() => worker.close(), DRAIN_MS); }
      catch { await worker.close(true).catch((error: unknown) => { this.logger.warn(error); }); }
    }
    await this.queue.close();
  }
}
