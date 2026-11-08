import type { Instrument, InstrumentId } from '../../domain/index.js';

export interface SearchIndex {
  rebuild(instruments: readonly Instrument[]): void;
  suggest(q: string, limit: number): InstrumentId[];
}
export const SEARCH_INDEX: symbol = Symbol('SEARCH_INDEX');
