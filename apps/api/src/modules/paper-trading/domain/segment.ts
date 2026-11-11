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

const INDIAN = ['NSE', 'BSE', 'NFO'];
const US = ['NASDAQ', 'NYSE', 'NYSEARCA', 'AMEX', 'CBOE'];

/**
 * What paper trading accepts (owner decision 2026-11-11: everything we chart): Indian cash and F&O, MCX commodities,
 * US stocks and ETFs, and forex and metals. Indices are not tradable. Each trades in its own currency's account.
 */
export function segmentOf(instrument: Pick<TradableInstrument, 'exchange' | 'type' | 'currency' | 'status'>): Segment | null {
  const { exchange, type, currency } = instrument;
  if (instrument.status !== 'active') return null;
  if (INDIAN.includes(exchange) && currency === 'INR') {
    if (type === 'stock' || type === 'etf') return 'equity';
    if (type === 'futures') return 'futures';
    if (type === 'option') return 'options';
    return null;
  }
  if (exchange === 'MCX' && currency === 'INR') return type === 'commodity' || type === 'futures' ? 'commodity' : type === 'option' ? 'options' : null;
  if (US.includes(exchange) && currency === 'USD' && (type === 'stock' || type === 'etf')) return 'us-equity';
  if ((exchange === 'FX' && type === 'forex') || (exchange === 'OANDA' && type === 'metal')) return 'forex';
  return null;
}

/** CNC is cash delivery (Indian and US stocks); NRML is positional derivatives, commodities and forex; MIS is intraday everywhere. */
export function productAllowed(segment: Segment, product: PaperProduct): boolean {
  if (product === 'MIS') return true;
  if (product === 'CNC') return segment === 'equity' || segment === 'us-equity';
  return segment !== 'equity' && segment !== 'us-equity';
}
