import type { MarketCalendar, SessionWindow } from './types';
import { INDIA_HOLIDAYS, MUHURAT_2026 } from './india';
import { SessionCalendar } from './session-calendar';
import { localTime, newYorkDst, weekday } from './time';
import { usHalfDay, usHoliday } from './us';

const indiaTz = 'Asia/Kolkata';
const usTz = 'America/New_York';
const usExchanges = ['NASDAQ', 'NYSE', 'NYSEARCA', 'AMEX', 'CBOE', 'IEX'];

class UnsupportedCalendarError extends Error {
  readonly code = 'VALIDATION_FAILED' as const;
  constructor(exchange: string) {
    super(`Unsupported exchange: ${exchange}`);
    this.name = 'UnsupportedCalendarError';
  }
}

export function holidaysKnownThrough(calendarId: string): string {
  const calendar = calendarFor(calendarId);
  return ['NSE', 'BSE', 'MCX'].includes(calendar.id) ? '2026-12-31' : '9999-12-31';
}

export function calendarFor(exchange: string): MarketCalendar {
  if (exchange === 'NSE' || exchange === 'NFO' || exchange === 'BSE') return new SessionCalendar(exchange === 'NFO' ? 'NSE' : exchange, indiaTz, date => indianSessions(date, false));
  if (exchange === 'MCX') return new SessionCalendar('MCX', indiaTz, date => indianSessions(date, true));
  if (exchange === 'FX' || exchange === 'OANDA') return new SessionCalendar(exchange, 'UTC', fxSessions);
  if (usExchanges.includes(exchange)) return new SessionCalendar(exchange, usTz, usSessions);
  throw new UnsupportedCalendarError(exchange);
}

function window(date: string, open: string, close: string, tz: string): SessionWindow[] {
  return [{ open: localTime(date, open, tz), close: localTime(date, close, tz) }];
}

function indianSessions(date: string, mcx: boolean): SessionWindow[] {
  if (date === MUHURAT_2026) return window(date, '18:00', '19:00', indiaTz); // confirm yearly
  if ([0, 6].includes(weekday(date))) return [];
  const holiday = INDIA_HOLIDAYS.find(value => value.date === date);
  const close = newYorkDst(localTime(date, '12:00', usTz)) ? '23:55' : '23:30';
  if (holiday) return mcx && holiday.eveningOnly ? window(date, '17:00', close, indiaTz) : [];
  return mcx ? window(date, '09:00', close, indiaTz) : window(date, '09:15', '15:30', indiaTz);
}

function usSessions(date: string): SessionWindow[] {
  if ([0, 6].includes(weekday(date)) || usHoliday(date)) return [];
  return window(date, '09:30', usHalfDay(date) ? '13:00' : '16:00', usTz);
}

// source: task P2-1's fixed UTC 24x5 session; FX day cutover is handled by the grid.
function fxSessions(date: string): SessionWindow[] {
  const day = weekday(date);
  if (day === 6) return [];
  const open = localTime(date, day === 0 ? '22:00' : '00:00', 'UTC');
  const close = day === 5 ? localTime(date, '22:00', 'UTC') : open - (day === 0 ? 22 : 0) * 3600000 + 86400000;
  return [{ open, close }];
}
