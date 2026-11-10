import { withTimeout } from '@aitrader/resilience';
import type { z } from 'zod';
import type { BacktestRequest, BacktestResponse, Health } from './generated/types.gen.js';
import { zBacktestResponse, zErrorBody, zHealth } from './generated/zod.gen.js';

/** The service answered with a non-2xx status; `body` is set when it carried the shared error shape. */
export class ComputeHttpError extends Error {
  override readonly name = 'ComputeHttpError';

  constructor(readonly status: number, readonly body: z.infer<typeof zErrorBody> | undefined) {
    super(`compute responded ${String(status)}${body ? ` ${body.code}: ${body.message}` : ''}`);
  }
}

/** A 2xx body that does not match the generated contract. */
export class ComputeResponseError extends Error {
  override readonly name = 'ComputeResponseError';
}

export interface ComputeClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  /** Per call unless the call passes its own. */
  timeoutMs?: number;
}

export interface CallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Carried to the service's logs (NFR-OB-1). */
  requestId?: string;
}

export interface ComputeClient {
  backtest(body: BacktestRequest, options?: CallOptions): Promise<BacktestResponse>;
  health(options?: CallOptions): Promise<Health>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export function createComputeClient(options: ComputeClientOptions): ComputeClient {
  const base = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetch ?? globalThis.fetch;

  async function call<T>(path: string, schema: z.ZodType<T>, init: RequestInit, opts: CallOptions): Promise<T> {
    const headers = new Headers(init.headers);
    if (opts.requestId !== undefined) headers.set('x-request-id', opts.requestId);
    const timeoutMs = opts.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return withTimeout(async signal => {
      const res = await fetchImpl(`${base}${path}`, { ...init, headers, signal });
      const payload: unknown = await res.json().catch(() => undefined);
      if (!res.ok) throw new ComputeHttpError(res.status, zErrorBody.safeParse(payload).data);
      const parsed = schema.safeParse(payload);
      if (!parsed.success) throw new ComputeResponseError(`compute response for ${path} does not match the contract`, { cause: parsed.error });
      return parsed.data;
    }, timeoutMs, opts.signal);
  }

  return {
    backtest: (body, opts = {}) => call('/compute/v1/backtest', zBacktestResponse, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }, opts),
    health: (opts = {}) => call('/health', zHealth, { method: 'GET' }, opts),
  };
}
