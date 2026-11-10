import type { PriceBar } from '../../domain/matching';
import type { TradableInstrument } from '../../domain/segment';
import type { Session } from '../../domain/session-rules';

/** What paper trading reads from the instrument master, market data and the session calendars. */
export interface PaperMarket {
  /** Resolves to the canonical instrument; throws the instrument module's not-found error. */
  instrument(id: string): Promise<TradableInstrument>;
  /** The last known price and its bar time, or null when there is none. */
  quote(instrumentId: string, signal?: AbortSignal): Promise<{ price: number; at: number } | null>;
  /** One-minute bars (stored and forming) starting at or after `since`, oldest first. */
  barsSince(instrumentId: string, since: number, signal?: AbortSignal): Promise<PriceBar[]>;
  /** The trading session containing `at`, or null when the market is closed. */
  session(instrumentId: string, at: number): Session | null;
  /** Keeps live feeds open for exactly these instruments (subscription leases). */
  watch(instrumentIds: readonly string[]): Promise<void>;
}
export const PAPER_MARKET = Symbol('PAPER_MARKET');
