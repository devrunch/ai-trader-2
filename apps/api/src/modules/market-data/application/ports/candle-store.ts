import type { Bar } from '../../domain/bar';

export interface CandleStore {
  upsert1m(instrumentId: string, bars: readonly Bar[], source: string, signal?: AbortSignal): Promise<{ written: number; repaired: number }>;
  upsert1d(instrumentId: string, bars: readonly Bar[], source: string, signal?: AbortSignal): Promise<{ written: number; repaired: number }>;
  range1m(instrumentId: string, from: number, to: number, signal?: AbortSignal): Promise<Bar[]>;
  range1d(instrumentId: string, from: string, to: string, signal?: AbortSignal): Promise<Bar[]>;
  earliest(instrumentId: string, daily: boolean, signal?: AbortSignal): Promise<number | null>;
  /** Start time of the newest stored 1-minute bar. */
  latest1m(instrumentId: string, signal?: AbortSignal): Promise<number | null>;
  /** Instruments with any 1-minute bar in [from, to). */
  instrumentsWith1m(from: number, to: number, signal?: AbortSignal): Promise<string[]>;
}
