import { calendarFor, calendarForInstrument } from '../domain/calendar';

/** Public calendar questions for other modules (alerts, paper trading). */
export function isTradingDay(exchange: string, date: string): boolean {
  try { return calendarFor(exchange).sessionsOn(date).length > 0; } catch { return false; }
}

export function isMarketOpen(exchange: string, at: number): boolean {
  try { return calendarFor(exchange).isOpen(at); } catch { return false; }
}

/** The session of this instrument's calendar containing `at` (derivatives keep their own hours), or null when closed or unknown. */
export function sessionAt(instrumentId: string, at: number): { open: number; close: number } | null {
  try { return calendarForInstrument(instrumentId).sessionContaining(at); } catch { return null; }
}
