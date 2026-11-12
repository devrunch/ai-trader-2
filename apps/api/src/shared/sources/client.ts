import type { Redis } from 'ioredis';
import { backoffDelay, sleep, TimeoutError } from '@aitrader/resilience';
import { RateLimitedError } from '../errors';
import { RedisTokenBucket } from '../redis/redis-token-bucket';
import type { SourceHealth } from './health';
import type { SourceRegistry } from './registry';

export interface SourceRequest {
  headers?: Record<string, string>;
  /** Default 10 s. */ timeoutMs?: number;
  /** Largest body accepted, default 2 MB. */ maxBytes?: number;
  signal?: AbortSignal;
  /** How long to wait for a rate-limit token before giving up, default 10 s. */ maxWaitMs?: number;
}
export interface SourceResponse { status: number; text: string; headers: Headers }

export class SourceUnavailableError extends Error { override readonly name = 'SourceUnavailableError'; constructor(readonly sourceId: string, message: string) { super(message); } }

const USER_AGENT = 'ai-trader/1.0 (+https://ai-trader.app.outlfy.com; personal research tool)';
const MAX_ATTEMPTS = 3;

/**
 * The only HTTP path for source adapters: the source must be registered and enabled, calls wait for the source's Redis token bucket (shared by every process),
 * time out, are capped in size and identify themselves; 429 and 5xx are retried with backoff, other 4xx are not. Every call is recorded in the source's health.
 */
export class SourceClient {
  private readonly buckets = new Map<string, RedisTokenBucket>();

  constructor(private readonly registry: SourceRegistry, private readonly health: SourceHealth, private readonly redis: Redis,
    private readonly fetchFn: typeof fetch = fetch) {}

  async get(sourceId: string, url: string, request: SourceRequest = {}): Promise<SourceResponse> {
    const descriptor = this.registry.get(sourceId);
    if (!this.registry.isEnabled(sourceId)) throw new SourceUnavailableError(sourceId, `Source ${sourceId} is off (no key)`);
    const started = performance.now();
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
        const response = await this.fetchFn(url, { headers: { 'user-agent': USER_AGENT, ...request.headers }, signal });
        if (response.status === 429 || response.status >= 500) {
          lastError = `HTTP ${String(response.status)}`;
          if (response.status === 429) await this.health.rateLimited(sourceId);
          if (attempt < MAX_ATTEMPTS) { await sleep(backoffDelay(attempt, { baseMs: 500, maxMs: 8000 }), request.signal); continue; }
          break;
        }
        const text = await readCapped(response, request.maxBytes ?? 2_000_000);
        if (response.status >= 400) { await this.health.failure(sourceId, `HTTP ${String(response.status)}`); throw new SourceUnavailableError(sourceId, `${sourceId} answered HTTP ${String(response.status)}`); }
        await this.health.success(sourceId, { items: 0, latencyMs: Math.round(performance.now() - started) });
        return { status: response.status, text, headers: response.headers };
      } catch (error) {
        if (error instanceof SourceUnavailableError) throw error;
        lastError = error instanceof Error ? error.message : 'request failed';
        if (request.signal?.aborted) break;
        if (attempt < MAX_ATTEMPTS) await sleep(backoffDelay(attempt, { baseMs: 500, maxMs: 8000 }), request.signal).catch(() => undefined);
      }
    }
    await this.health.failure(sourceId, lastError);
    throw new SourceUnavailableError(sourceId, `${sourceId} failed: ${lastError}`);
  }

  /** The adapter reports how many items its parse found, so "items in 24 h" and the shape-changed check mean something. */
  async recordItems(sourceId: string, items: number): Promise<void> {
    if (items === 0) { await this.health.failure(sourceId, 'parsed zero items (the source changed shape or is empty)'); return; }
    await this.health.success(sourceId, { items, latencyMs: 0 });
  }

  private bucket(id: string, limit: { requests: number; windowSec: number }): RedisTokenBucket {
    let bucket = this.buckets.get(id);
    if (!bucket) {
      bucket = new RedisTokenBucket(this.redis, `source-limit:${id}`, Math.max(1, limit.requests), limit.requests / limit.windowSec);
      this.buckets.set(id, bucket);
    }
    return bucket;
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new SourceUnavailableError('response', `response is larger than ${String(maxBytes)} bytes`);
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new SourceUnavailableError('response', `response is larger than ${String(maxBytes)} bytes`); }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
