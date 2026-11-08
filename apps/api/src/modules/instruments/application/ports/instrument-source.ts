import type { Instrument } from '../../domain/instrument.js';

export interface ProviderMapping {
  id: string;
  provider: 'kite' | 'deriv' | 'us-delayed';
  providerSymbol: string;
  providerToken?: string;
}
export interface SourceSnapshot { instruments: Instrument[]; mappings: ProviderMapping[] }
export interface InstrumentSource {
  readonly name: 'kite' | 'deriv' | 'nasdaq';
  fetch(signal: AbortSignal): Promise<SourceSnapshot>;
}
export const INSTRUMENT_SOURCES: symbol = Symbol('INSTRUMENT_SOURCES');
