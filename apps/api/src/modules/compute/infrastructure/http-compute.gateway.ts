import {
  ComputeHttpError, ComputeResponseError, type BacktestRequest, type BacktestResponse, type ComputeClient,
} from '@aitrader/compute-client';
import { AbortedError, CircuitBreaker, retry, TimeoutError } from '@aitrader/resilience';
import type { ComputeGateway, ComputeResult } from '../application/ports/compute-gateway';

interface Options { timeoutMs?: number; now?: () => number; random?: () => number }

const isClientError = (error: unknown): error is ComputeHttpError =>
  error instanceof ComputeHttpError && error.status >= 400 && error.status < 500;

// Only failures a second attempt can fix: the connection, or a 502/503 from the service or its proxy.
// A timeout or the service's own 504 is not retried: the same request would take as long again.
function isRetryable(error: unknown): boolean {
  if (error instanceof ComputeHttpError) return error.status === 502 || error.status === 503;
  return !(error instanceof TimeoutError || error instanceof AbortedError || error instanceof ComputeResponseError);
}

export class HttpComputeGateway implements ComputeGateway {
  private readonly breaker: CircuitBreaker;
  private readonly timeoutMs: number;

  constructor(private readonly client: ComputeClient, private readonly opts: Options = {}) {
    this.timeoutMs = opts.timeoutMs ?? 15000;
    this.breaker = new CircuitBreaker({
      failureThreshold: 3, openMs: 30000, isFailure: error => !isClientError(error), ...(opts.now ? { now: opts.now } : {}),
    });
  }

  async backtest(request: BacktestRequest, signal: AbortSignal): Promise<ComputeResult<BacktestResponse>> {
    try {
      const data = await this.breaker.exec(() => retry(
        (_attempt, attemptSignal) => this.client.backtest(request, { signal: attemptSignal, timeoutMs: this.timeoutMs }),
        { retries: 2, baseMs: 200, maxMs: 2000, signal, retryOn: isRetryable, ...(this.opts.random ? { random: this.opts.random } : {}) },
      ));
      return { ok: true, data };
    } catch (error) {
      signal.throwIfAborted();
      if (isClientError(error)) return { ok: false, reason: 'INVALID', detail: error.body?.message ?? error.message };
      return { ok: false, reason: 'UNAVAILABLE' };
    }
  }
}
