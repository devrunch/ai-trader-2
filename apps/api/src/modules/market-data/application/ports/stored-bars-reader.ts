import type { Bar } from '../../domain/bar';

/** Batched reads of the candle store for scans: many instruments per query, never a vendor call. */
export interface StoredBarsReader {
  /** Daily bars with session date in [from, to), oldest first, by instrument. */
  range1d(ids: readonly string[], from: string, to: string, signal?: AbortSignal): Promise<Map<string, Bar[]>>;
  /** 1-minute bars in [from, to), oldest first, by instrument. */
  range1m(ids: readonly string[], from: number, to: number, signal?: AbortSignal): Promise<Map<string, Bar[]>>;
}
