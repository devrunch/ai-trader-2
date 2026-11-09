import type { PaperProduct } from '@aitrader/contracts';

export interface Session { open: number; close: number }

const MINUTE = 60_000;
/** Intraday square-off, minutes before the session close: 15:20 IST on a 15:30 close (FR-PT-5). */
const SQUARE_OFF_LEAD: Readonly<Record<string, number>> = { NSE: 10 * MINUTE, BSE: 10 * MINUTE, NFO: 10 * MINUTE };
const DEFAULT_LEAD = 10 * MINUTE;

/** Follows the session, so half days and the Muhurat session square off relative to their own close. */
export function squareOffAt(exchange: string, session: Session): number {
  return session.close - (SQUARE_OFF_LEAD[exchange] ?? DEFAULT_LEAD);
}

/** Every order is a DAY order; MIS orders leave the book at the square-off. */
export function orderExpiresAt(product: PaperProduct, exchange: string, session: Session): number {
  return product === 'MIS' ? squareOffAt(exchange, session) : session.close;
}
