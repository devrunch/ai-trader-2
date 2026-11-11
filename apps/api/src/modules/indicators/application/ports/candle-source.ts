import type { Bar, Interval } from '@aitrader/contracts';

export interface CandleRequest { symbol: string; interval: Interval; from?: number | undefined; to?: number | undefined }

/** Bars of any symbol and interval for `request.security` (FR-IN-3); `reason` says why there are none (E27). */
export interface CandleSource {
  read(request: CandleRequest, signal?: AbortSignal): Promise<{ bars: Bar[]; reason?: string }>;
}
