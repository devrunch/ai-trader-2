import type { Instrument, InstrumentChange } from '../../domain/index.js';
import type { ProviderMapping, SourceSnapshot } from './instrument-source.js';

export interface InstrumentRepository {
  loadSource(source: string): Promise<{ instruments: Instrument[]; mappings: ProviderMapping[] }>;
  applySource(source: string, snapshot: SourceSnapshot, changes: InstrumentChange[], at: string): Promise<void>;
  findById(id: string): Promise<Instrument | null>;
  findRenameSuccessor(id: string): Promise<string | null>;
  listForIndex(): Promise<Instrument[]>;
  listContinuousCandidates(underlyingOrRoot: string, exchange: string): Promise<Instrument[]>;
  setSourceStatus(source: string, s: { status: 'ok' | 'stale'; reason?: string; count?: number; at: string }): Promise<void>;
  purgeExpired(before: string): Promise<number>;
}
export const INSTRUMENT_REPOSITORY: symbol = Symbol('INSTRUMENT_REPOSITORY');
