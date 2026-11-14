import type { SnapshotLeg } from '../../domain/chain-stats';

export interface OptionContract { symbol: string; strike: number; type: 'CE' | 'PE'; expiry: string }
/** The listed option contracts of one underlying, as the instrument master knows them, with the vendor symbols to quote. */
export interface OptionContracts {
  list(underlying: string, today: string, signal: AbortSignal): Promise<{ spotSymbol: string; contracts: OptionContract[] } | null>;
}

export interface QuotedLeg { ltp: number | null; oi: number | null; volume: number | null }
export interface OptionQuotes {
  /** Quotes for vendor symbols; a symbol the vendor did not answer for is absent. */
  quote(symbols: string[], signal: AbortSignal): Promise<Map<string, QuotedLeg>>;
}

export interface OptionSnapshot { underlying: string; expiry: string; takenAt: number; spot: number | null; legs: SnapshotLeg[] }
export interface OptionSnapshotStore {
  save(snapshot: OptionSnapshot): Promise<void>;
  /** The newest snapshot taken at or before `atMost` (epoch ms). */
  latest(underlying: string, expiry: string, atMost: number): Promise<OptionSnapshot | null>;
  /** The newest snapshot taken before `before`, for open-interest change against an earlier day. */
  before(underlying: string, expiry: string, before: number): Promise<OptionSnapshot | null>;
  /** Underlyings that were read recently, so the close job keeps their baselines. */
  recentUnderlyings(since: number): Promise<string[]>;
  purge(before: number): Promise<number>;
}
