import type { Instrument, InstrumentChange } from '../../domain/index.js';
import type { ProviderMapping, SourceSnapshot } from './instrument-source.js';

export interface InstrumentRepository {
  loadSource(source: string): Promise<{ instruments: Instrument[]; mappings: ProviderMapping[] }>;
  applySource(source: string, snapshot: SourceSnapshot, changes: InstrumentChange[], at: string): Promise<void>;
  findById(id: string, signal?: AbortSignal): Promise<Instrument | null>;
  getMapping(id: string, provider: ProviderMapping['provider'], signal?: AbortSignal): Promise<ProviderMapping | undefined>;
  findLastChange(id: string): Promise<InstrumentChange | null>;
  findRenameSuccessor(id: string): Promise<string | null>;
  listForIndex(signal?: AbortSignal): Promise<Instrument[]>;
  listContinuousCandidates(underlyingOrRoot: string, exchange: string): Promise<Instrument[]>;
  setSourceStatus(source: string, s: { status: 'ok' | 'stale'; reason?: string; count?: number; at: string }): Promise<void>;
  purgeExpired(before: string): Promise<number>;
  listSourceStatus(signal?: AbortSignal): Promise<SourceStatusRow[]>;
}
export const INSTRUMENT_REPOSITORY: symbol = Symbol('INSTRUMENT_REPOSITORY');

export interface SourceStatusRow { source: string; status: string; reason: string | null; count: number; lastSuccessAt: string | null }
