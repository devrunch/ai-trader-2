import type { ProviderReason } from '@aitrader/contracts';

export type FeedVendor = 'kite' | 'deriv' | 'us-delayed';
export type FeedStateRecord =
  | { state: 'unknown' }
  | { state: 'connecting' | 'live' | 'reconnecting' | 'stale' | 'stopped'; reason?: ProviderReason; detail?: string; at: number };

// Written by the market-data process (P2-9); read by the API to report honest status.
export interface FeedStateStore {
  get(vendor: FeedVendor, signal?: AbortSignal): Promise<FeedStateRecord>;
}
