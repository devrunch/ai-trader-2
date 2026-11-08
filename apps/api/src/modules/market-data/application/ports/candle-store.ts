import type { Bar } from '../../domain/bar';

export interface CandleStore {
  upsert1m(instrumentId: string, bars: readonly Bar[], source: string): Promise<{ written: number; repaired: number }>;
  upsert1d(instrumentId: string, bars: readonly Bar[], source: string): Promise<{ written: number; repaired: number }>;
  range1m(instrumentId: string, from: number, to: number): Promise<Bar[]>;
  range1d(instrumentId: string, from: string, to: string): Promise<Bar[]>;
  earliest(instrumentId: string, daily: boolean): Promise<number | null>;
}
