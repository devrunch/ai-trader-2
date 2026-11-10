import type { BacktestRequest, BacktestResponse } from '@aitrader/compute-client';

/** `UNAVAILABLE`: down, slow, breaker open or a broken contract (E21). `INVALID`: the service rejected the request. */
export type ComputeResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'UNAVAILABLE' }
  | { ok: false; reason: 'INVALID'; detail: string };

/** The stateless Python compute service (SRD §10.2). */
export interface ComputeGateway {
  backtest(request: BacktestRequest, signal: AbortSignal): Promise<ComputeResult<BacktestResponse>>;
}
