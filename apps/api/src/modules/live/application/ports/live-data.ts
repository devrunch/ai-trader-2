import { BarSchema, INTERVALS, type BarUpdate, type DataStatus } from '@aitrader/contracts';
import type { z } from 'zod';

export type Interval = (typeof INTERVALS)[number];
export type LiveBar = z.infer<typeof BarSchema>;
export type LiveChange = { type: 'bar'; update: BarUpdate } | { type: 'status'; status: DataStatus } | { type: 'reconnect' };
export interface LiveData {
  resolve(symbol: string): Promise<string | null>;
  read(instrumentId: string, interval: Interval, limit: number): Promise<{ bars: LiveBar[]; status: DataStatus }>;
  current(instrumentId: string): Promise<number>;
  replay(instrumentId: string, afterSeq: number): Promise<BarUpdate[] | null>;
  watch(instrumentId: string, listener: (change: LiveChange) => void): () => void;
  acquire(instrumentId: string): Promise<void>;
  release(instrumentId: string): Promise<void>;
  aggregate(bars: readonly LiveBar[], interval: Interval, instrumentId: string): LiveBar[];
}
