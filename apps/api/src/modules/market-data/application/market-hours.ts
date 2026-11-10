import { calendarFor, calendarForInstrument } from '../domain/calendar';

/** Public calendar questions for other modules (alerts). */
export function isTradingDay(exchange: string, date: string): boolean {
  try { return calendarFor(exchange).sessionsOn(date).length > 0; } catch { return false; }
}

export function isMarketOpen(exchange: string, at: number): boolean {
  try { return calendarFor(exchange).isOpen(at); } catch { return false; }
}

/** The IANA timezone of an instrument's exchange (indicator anchors); UTC when the exchange has no calendar. */
export function exchangeTimezone(instrumentId: string): string {
  try { return calendarForInstrument(instrumentId).timezone; } catch { return 'UTC'; }
}
