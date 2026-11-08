import type { InstrumentSummary } from '@aitrader/contracts';
import type { Instrument, InstrumentId, InstrumentType } from '../../domain/index.js';

export interface SearchOptions { exchange?: string; type?: InstrumentType; limit: number }

export interface SearchIndex {
  search(q: string, opts: SearchOptions): InstrumentSummary[];
  rebuild(instruments: readonly Instrument[]): void;
  suggest(q: string, limit: number): InstrumentId[];
}
export const SEARCH_INDEX: symbol = Symbol('SEARCH_INDEX');
