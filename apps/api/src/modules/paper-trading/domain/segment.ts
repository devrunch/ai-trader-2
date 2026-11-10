import type { PaperProduct, PaperSegment } from '@aitrader/contracts';

export type Segment = PaperSegment;

/** The subset of an instrument master row that paper trading needs. */
export interface TradableInstrument {
  id: string;
  exchange: string;
  type: string;
  currency: string;
  status: string;
  lotSize: number;
  /** Smallest price increment. */
  tick: number;
}

const ALLOWED_EXCHANGES = ['NSE', 'BSE', 'NFO'];

/** First release: INR Indian cash and derivatives (FR-PT-1, Q4). Indices, commodities and forex are not tradable. */
export function segmentOf(instrument: Pick<TradableInstrument, 'exchange' | 'type' | 'currency' | 'status'>): Segment | null {
  if (instrument.currency !== 'INR' || instrument.status !== 'active' || !ALLOWED_EXCHANGES.includes(instrument.exchange)) return null;
  if (instrument.type === 'stock' || instrument.type === 'etf') return 'equity';
  if (instrument.type === 'futures') return 'futures';
  if (instrument.type === 'option') return 'options';
  return null;
}

/** CNC is equity delivery only; NRML is derivatives only; MIS is both. */
export function productAllowed(segment: Segment, product: PaperProduct): boolean {
  if (product === 'MIS') return true;
  return product === 'CNC' ? segment === 'equity' : segment !== 'equity';
}
