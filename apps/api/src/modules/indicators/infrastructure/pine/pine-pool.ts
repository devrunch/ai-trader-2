import { Worker } from 'node:worker_threads';
import { PineWorkerError, type PineLimitReason } from '../../domain/pine/pine-errors';
import { WorkerMessageSchema, type Candle, type HostMessage, type WorkerMessage } from './pine-protocol';

export interface PinePoolOptions {
  workerFile: string;
  /** Workers started at most; they start on first use. */
  size: number;
  heapMb: number;
  /** Longest a worker may take to answer one request before it is killed (E26). */
  timeoutMs: number;
}

type FetchRequest = Extract<WorkerMessage, { type: 'fetch' }>;
export type FetchHandler = (request: FetchRequest) => Promise<{ candles: Candle[]; reason?: string }>;
type Reply = Exclude<WorkerMessage, { type: 'fetch' }>;
interface Pending { resolve(reply: Reply): void; reject(error: Error): void; timer: NodeJS.Timeout; abort?: () => void; signal?: AbortSignal }
/** A request without its `ref`, which the worker object assigns. */
export type HostRequest = HostMessage extends infer M ? M extends { ref: number } ? Omit<M, 'ref'> : never : never;

/** The worker's own error text, as a script failure rather than a lost worker. */
export class PineRemoteError extends Error {}

/** One worker thread. Once it dies (limit hit, crash, `kill`) it stays dead and every call on it rejects; the pool starts a new one. */
export class PineWorker {
  private readonly thread: Worker;
  private readonly pending = new Map<number, Pending>();
  private readonly fetchers = new Map<number, FetchHandler>();
  private nextRef = 1;
  private failure: PineWorkerError | null = null;
  instances = 0;

  constructor(private readonly options: PinePoolOptions) {
    this.thread = new Worker(options.workerFile, { resourceLimits: { maxOldGenerationSizeMb: options.heapMb } });
    this.thread.on('message', (raw: unknown) => { this.receive(raw); });
    this.thread.on('error', (error: Error) => { this.die('code' in error && error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'PINE_OUT_OF_MEMORY' : 'PINE_CRASHED', error.message); });
    this.thread.on('exit', () => { this.die('PINE_CRASHED', 'The Pine worker exited'); });
  }

  get alive(): boolean { return this.failure === null; }

  /** Sends a request and resolves with the worker's reply, or rejects on its error, on the timeout (worker killed) or on abort. */
  request(build: HostRequest, signal?: AbortSignal): Promise<Reply> {
    if (this.failure) return Promise.reject(this.failure);
    const ref = this.nextRef++;
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => { this.die('PINE_TIMEOUT', `The script ran longer than ${String(this.options.timeoutMs)} ms and was stopped`); }, this.options.timeoutMs);
      const entry: Pending = { resolve, reject, timer };
      if (signal) {
        const abort = (): void => { this.settle(ref)?.reject(new Error('Aborted')); };
        if (signal.aborted) { clearTimeout(timer); reject(new Error('Aborted')); return; }
        signal.addEventListener('abort', abort, { once: true });
        entry.signal = signal;
        entry.abort = abort;
      }
      this.pending.set(ref, entry);
      this.thread.postMessage({ ...build, ref });
    });
  }

  /** Fire and forget (close). */
  post(message: HostMessage): void {
    if (!this.failure) this.thread.postMessage(message);
  }

  onFetch(instance: number, handler: FetchHandler | null): void {
    if (handler) this.fetchers.set(instance, handler); else this.fetchers.delete(instance);
  }

  /** Stops the thread; pending calls reject with the reason. */
  kill(reason: PineLimitReason, message: string): void { this.die(reason, message); }

  private settle(ref: number): Pending | undefined {
    const entry = this.pending.get(ref);
    if (!entry) return undefined;
    this.pending.delete(ref);
    clearTimeout(entry.timer);
    if (entry.signal && entry.abort) entry.signal.removeEventListener('abort', entry.abort);
    return entry;
  }

  private receive(raw: unknown): void {
    const message = WorkerMessageSchema.parse(raw);
    if (message.type === 'fetch') { this.answerFetch(message); return; }
    const entry = this.settle(message.ref);
    if (!entry) return;
    if (message.type === 'error') entry.reject(new PineRemoteError(message.message)); else entry.resolve(message);
  }

  private answerFetch(request: FetchRequest): void {
    const handler = this.fetchers.get(request.instance);
    const reply = handler ? handler(request) : Promise.resolve({ candles: [], reason: 'no data source' });
    reply.catch((error: unknown) => ({ candles: [], reason: error instanceof Error ? error.message : 'data unavailable' }))
      .then(({ candles, reason }) => { this.post({ type: 'candles', fetch: request.fetch, candles, ...(reason === undefined ? {} : { reason }) }); }, () => undefined);
  }

  private die(reason: PineLimitReason, message: string): void {
    if (this.failure) return;
    this.failure = new PineWorkerError(reason, message);
    for (const ref of [...this.pending.keys()]) this.settle(ref)?.reject(this.failure);
    this.fetchers.clear();
    void this.thread.terminate();
  }
}

/** E26: a bounded set of lazily started workers; a dead one is replaced on the next use, and native indicators never touch it. */
export class PinePool {
  private readonly workers: (PineWorker | undefined)[];

  constructor(private readonly options: PinePoolOptions) {
    this.workers = Array.from({ length: options.size });
  }

  /** The least loaded live worker, starting a new one while a slot is free or dead and every live worker is busy. */
  acquire(): PineWorker {
    const live = this.workers.filter((worker): worker is PineWorker => worker?.alive === true);
    const idle = live.find(worker => worker.instances === 0);
    if (idle) return idle;
    const slot = this.workers.findIndex(worker => !worker?.alive);
    if (slot >= 0) {
      const started = new PineWorker(this.options);
      this.workers[slot] = started;
      return started;
    }
    return live.reduce((best, worker) => worker.instances < best.instances ? worker : best);
  }

  close(): void {
    for (const worker of this.workers) worker?.kill('PINE_CRASHED', 'The Pine pool is shutting down');
  }
}
