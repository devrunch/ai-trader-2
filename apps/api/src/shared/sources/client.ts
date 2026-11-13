import { backoffDelay, sleep as realSleep, TimeoutError } from '@aitrader/resilience';
import { RateLimitedError } from '../errors';
import type { SourceHealth } from './health';
import type { SourceRegistry } from './registry';

export interface SourceRequest {
  headers?: Record<string, string>;
  /** Default 10 s. */ timeoutMs?: number;
  /** Largest body accepted, default 2 MB. */ maxBytes?: number;
  /** 4xx statuses the caller expects (a not-yet-published page): returned as is, not retried and not counted as a failure. */
  allowStatus?: number[];
  /** A JSON request body: the call becomes a POST (for the few vendors whose read API is a POST). */ body?: string;
  /** Also return the raw bytes (a PDF); `text` is then empty. */ binary?: boolean;
  signal?: AbortSignal;
  /** How long to wait for a rate-limit token before giving up, default 10 s. */ maxWaitMs?: number;
}
export interface SourceResponse { status: number; text: string; headers: Headers; /** Set when the request asked for `binary`. */ bytes?: Uint8Array }

export class SourceUnavailableError extends Error { override readonly name = 'SourceUnavailableError'; constructor(readonly sourceId: string, message: string) { super(message); } }

/** The shared per-source rate limit; production uses the Redis token bucket so every process draws from one budget. */
export interface SourceBucket { take(signal: AbortSignal, maxWaitMs: number): Promise<void> }
export type SourceBucketFactory = (sourceId: string, limit: { requests: number; windowSec: number }) => SourceBucket;

export interface SourceClientOptions { fetch?: typeof fetch; sleep?: (ms: number, signal?: AbortSignal) => Promise<void>; random?: () => number }

const USER_AGENT = 'ai-trader/1.0 (+https://ai-trader.app.outlfy.com; personal research tool)';
const MAX_ATTEMPTS = 3;

/**
 * The only HTTP path for source adapters: the source must be registered and enabled, calls wait for the source's token bucket,
 * time out, are capped in size and identify themselves; 429 and 5xx are retried with backoff, other 4xx are not. Every call is recorded in the source's health.
 */
export class SourceClient {
  private readonly buckets = new Map<string, SourceBucket>();
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly random: (() => number) | undefined;

  constructor(private readonly registry: SourceRegistry, private readonly health: SourceHealth, private readonly makeBucket: SourceBucketFactory, options: SourceClientOptions = {}) {
    this.fetchFn = options.fetch ?? fetch;
    this.sleep = options.sleep ?? realSleep;
    this.random = options.random;
  }

  async get(sourceId: string, url: string, request: SourceRequest = {}): Promise<SourceResponse> {
    const descriptor = this.registry.get(sourceId);
    if (!this.registry.isEnabled(sourceId)) throw new SourceUnavailableError(sourceId, `Source ${sourceId} is off (no key)`);
    const started = performance.now();
    const maxBytes = request.maxBytes ?? 2_000_000;
    let lastError = 'no attempt';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const signal = AbortSignal.any([AbortSignal.timeout(request.timeoutMs ?? 10_000), ...(request.signal ? [request.signal] : [])]);
      try {
        await this.bucket(sourceId, descriptor.rateLimit).take(signal, request.maxWaitMs ?? 10_000);
      } catch (error) {
        if (error instanceof RateLimitedError || error instanceof TimeoutError || (error instanceof Error && error.name === 'TimeoutError')) await this.health.rateLimited(sourceId);
        await this.health.failure(sourceId, `rate limit: ${error instanceof Error ? error.message : 'wait failed'}`);
        throw error;
      }
      try {
        const response = await this.fetchFn(url, { headers: { 'user-agent': USER_AGENT, ...request.headers }, signal, ...(request.body === undefined ? {} : { method: 'POST', body: request.body }) });
        if (response.status === 429 || response.status >= 500) {
          lastError = `HTTP ${String(response.status)}`;
          if (response.status === 429) await this.health.rateLimited(sourceId);
          await response.body?.cancel().catch(() => undefined);
          if (attempt < MAX_ATTEMPTS) { await this.backoff(attempt, request.signal); continue; }
          break;
        }
        if (response.status >= 400 && request.allowStatus?.includes(response.status)) {
          await response.body?.cancel().catch(() => undefined);
          return { status: response.status, text: '', headers: response.headers };
        }
        if (response.status >= 400) {
          await response.body?.cancel().catch(() => undefined);
          throw await this.fail(sourceId, `HTTP ${String(response.status)}`, `${sourceId} answered HTTP ${String(response.status)}`);
        }
        const bytes = await readCappedBytes(response, maxBytes, () => tooBig(sourceId, maxBytes));
        await this.health.success(sourceId, { items: 0, latencyMs: Math.round(performance.now() - started) });
        return request.binary ? { status: response.status, text: '', headers: response.headers, bytes } : { status: response.status, text: new TextDecoder().decode(bytes), headers: response.headers };
      } catch (error) {
        if (error instanceof SourceUnavailableError) {
          // Oversize bodies are not retried: the next attempt would be just as large.
          if (error.message.includes('larger than')) await this.health.failure(sourceId, error.message);
          throw error;
        }
        lastError = error instanceof Error ? error.message : 'request failed';
        if (request.signal?.aborted) break;
        if (attempt < MAX_ATTEMPTS) await this.backoff(attempt, request.signal);
      }
    }
    await this.health.failure(sourceId, lastError);
    throw new SourceUnavailableError(sourceId, `${sourceId} failed: ${lastError}`);
  }

  /** The adapter reports how many items its parse found, so "items in 24 h" and the shape-changed check mean something. */
  async recordItems(sourceId: string, items: number): Promise<void> {
    if (items === 0) { await this.health.failure(sourceId, 'parsed zero items (the source changed shape or is empty)'); return; }
    await this.health.items(sourceId, items);
  }

  private async fail(sourceId: string, recorded: string, message: string): Promise<SourceUnavailableError> {
    await this.health.failure(sourceId, recorded);
    return new SourceUnavailableError(sourceId, message);
  }

  private async backoff(attempt: number, signal: AbortSignal | undefined): Promise<void> {
    await this.sleep(backoffDelay(attempt, { baseMs: 500, maxMs: 8000, ...(this.random ? { random: this.random } : {}) }), signal).catch(() => undefined);
  }

  private bucket(id: string, limit: { requests: number; windowSec: number }): SourceBucket {
    let bucket = this.buckets.get(id);
    if (!bucket) { bucket = this.makeBucket(id, limit); this.buckets.set(id, bucket); }
    return bucket;
  }
}

/** Reads at most `maxBytes`; a longer body is refused (not cut) with the error `tooBig` builds. */
async function readCappedBytes(response: Response, maxBytes: number, tooBig: () => Error): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) { await response.body?.cancel().catch(() => undefined); throw tooBig(); }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw tooBig(); }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** The same as a string, for text bodies. */
export async function readCappedBody(response: Response, maxBytes: number, tooBig: () => Error): Promise<string> {
  return new TextDecoder().decode(await readCappedBytes(response, maxBytes, tooBig));
}

const tooBig = (sourceId: string, maxBytes: number): SourceUnavailableError => new SourceUnavailableError(sourceId, `${sourceId} response is larger than ${String(maxBytes)} bytes`);
