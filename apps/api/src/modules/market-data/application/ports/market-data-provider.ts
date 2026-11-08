import type { Bar } from '../../domain/bar';

export type ProviderReason = 'NO_DATA' | 'MARKET_CLOSED' | 'UNSUPPORTED' | 'RATE_LIMITED' | 'PROVIDER_DOWN' | 'AUTH_EXPIRED';
export type ProviderResult<T> = { ok: true; data: T } | { ok: false; reason: ProviderReason; detail?: string; retryAfterMs?: number };
export interface MarketDataProvider {
  readonly name: 'kite' | 'deriv' | 'us-delayed';
  history(m: { providerSymbol: string; providerToken?: string }, res: '1m' | '1d', from: number, to: number,
    signal: AbortSignal): Promise<ProviderResult<Bar[]>>;
}
export const MARKET_DATA_PROVIDERS: symbol = Symbol('MARKET_DATA_PROVIDERS');
