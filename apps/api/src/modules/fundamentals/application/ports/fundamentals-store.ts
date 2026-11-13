import type { Fundamentals } from '@aitrader/contracts';

export interface FundamentalsStore {
  /** Newest record for the symbol; with `asOf`, newest one fetched AND with results published by then, never a later one. */
  latest(symbol: string, asOf?: number): Promise<Fundamentals | null>;
  /** Newest record of each symbol that has one. */
  latestMany(symbols: string[], asOf?: number): Promise<Fundamentals[]>;
  /** One row per fetch; saving the same (symbol, fetchedAt) twice is a no-op. */
  save(record: Fundamentals): Promise<void>;
  /** Symbols fetched at or after `since`. */
  fetchedSince(since: number): Promise<Set<string>>;
}

/** The NIFTY 500 constituents as canonical ids; the instruments module provides it. */
export interface Nifty500List { symbols(): Promise<string[]> }
