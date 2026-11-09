import type { BarUpdate } from '@aitrader/contracts';

export interface BarSequenceStore {
  current(instrumentId: string): Promise<number>;
  updates(instrumentId: string): Promise<BarUpdate[]>;
}
