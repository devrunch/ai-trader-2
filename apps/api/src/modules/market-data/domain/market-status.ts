import { calendarForInstrument } from './calendars/factory';
import { INDIA_HOLIDAYS } from './calendars/india';
import { dateAt, weekday } from './calendars/time';
import { usHoliday } from './calendars/us';

type ClosedReason = 'weekend' | 'holiday' | 'before-open' | 'after-close';
export interface MarketStatus {
  exchange: string; market: 'india' | 'us' | 'forex' | 'commodities' | 'crypto'; timezone: string; open: boolean;
  session: { open: number; close: number } | null; nextOpen: number | null; nextClose: number | null;
  closedReason: ClosedReason | null; holiday: string | null; forexSessions: Array<{ name: string; open: boolean; utcHours: string }> | null; note: string;
}

// Forex centres by local business hours, expressed in UTC (northern-hemisphere winter; shift an hour in summer).
const FX_CENTRES = [{ name: 'Sydney', from: 22, to: 7 }, { name: 'Tokyo', from: 0, to: 9 }, { name: 'London', from: 8, to: 17 }, { name: 'New York', from: 13, to: 22 }] as const;
const inCentre = (hour: number, c: { from: number; to: number }): boolean => (c.from < c.to ? hour >= c.from && hour < c.to : hour >= c.from || hour < c.to);

const marketOf = (exchange: string): MarketStatus['market'] =>
  ['NSE', 'BSE', 'NFO'].includes(exchange) ? 'india' : exchange === 'MCX' ? 'commodities' : exchange === 'OANDA' ? 'commodities' : exchange === 'FX' ? 'forex' : exchange === 'CRYPTO' ? 'crypto' : 'us';

/** Open or closed, the session, the next open and close, and why it is closed. Accepts a canonical id (`NSE:RELIANCE`) or a bare exchange (`NSE`); throws for an exchange with no calendar. */
export function marketStatus(idOrExchange: string, at: number): MarketStatus {
  const id = idOrExchange.includes(':') ? idOrExchange : `${idOrExchange}:X`;
  const exchange = id.split(':')[0] ?? '';
  if (exchange === 'CRYPTO') {
    return { exchange, market: 'crypto', timezone: 'UTC', open: true, session: null, nextOpen: null, nextClose: null, closedReason: null, holiday: null, forexSessions: null,
      note: 'Crypto trades 24/7; there is no close, but liquidity is thinner on weekends and overnight US time.' };
  }
  const cal = calendarForInstrument(id);
  const session = cal.sessionContaining(at);
  const date = dateAt(at, cal.timezone);
  const today = cal.sessionsOn(date);
  const holiday = INDIA_HOLIDAYS.find(h => h.date === date)?.name ?? (marketOf(exchange) === 'us' && usHoliday(date) ? 'US market holiday' : null);
  const closedToday = today.length === 0;
  const closedReason: ClosedReason | null = session ? null : [0, 6].includes(weekday(date)) && closedToday ? 'weekend' : closedToday ? 'holiday' : at < (today[0]?.open ?? 0) ? 'before-open' : 'after-close';
  const market = marketOf(exchange);
  const forexSessions = market === 'forex' || exchange === 'OANDA'
    ? FX_CENTRES.map(c => ({ name: c.name, open: session !== null && inCentre(new Date(at).getUTCHours(), c), utcHours: `${String(c.from).padStart(2, '0')}:00-${String(c.to).padStart(2, '0')}:00` })) : null;
  const note = forexSessions ? 'Forex runs Sunday 22:00 UTC to Friday 22:00 UTC; the most liquid hours are the London and New York overlap (13:00-17:00 UTC).'
    : closedReason === 'weekend' ? 'Weekend: prices shown are the last close.' : closedReason === 'holiday' ? `Exchange holiday${holiday ? ` (${holiday})` : ''}: prices shown are the last close.` : '';
  return { exchange, market, timezone: cal.timezone, open: session !== null, session, nextOpen: session ? null : cal.nextOpen(at), nextClose: session?.close ?? null, closedReason,
    holiday: closedReason === 'holiday' || (holiday !== null && closedToday) ? holiday : null, forexSessions, note };
}
