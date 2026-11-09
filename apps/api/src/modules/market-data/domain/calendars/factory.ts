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
  return ['NSE', 'NFO', 'BSE', 'MCX'].includes(calendar.id) ? '2026-12-31' : '9999-12-31';
}

export function calendarFor(exchange: string): MarketCalendar {
  if (exchange === 'NSE' || exchange === 'BSE') return new SessionCalendar(exchange, indiaTz, date => indianSessions(date, 'cash'));
  if (exchange === 'NFO') return new SessionCalendar('NFO', indiaTz, date => indianSessions(date, 'derivatives'));
  if (exchange === 'MCX') return new SessionCalendar('MCX', indiaTz, date => indianSessions(date, 'mcx'));
  if (exchange === 'FX' || exchange === 'OANDA') return new SessionCalendar(exchange, 'UTC', fxSessions);
  if (usExchanges.includes(exchange)) return new SessionCalendar(exchange, usTz, usSessions);
  throw new UnsupportedCalendarError(exchange);
}

function window(date: string, open: string, close: string, tz: string): SessionWindow[] {
  return [{ open: localTime(date, open, tz), close: localTime(date, close, tz) }];
}

// NSE/BSE futures and options: `ROOT<month code><yyyy>`, `ROOT<yymmdd><C|P><strike>`, or continuous `ROOT1!`.
const DERIVATIVE = /(?:[FGHJKMNQUVXZ]\d{4}|\d{6}[CP]\d+(?:\.\d+)?|\d+!)$/;

/** The calendar for one instrument: Indian derivatives keep a longer session than cash on the same exchange prefix. */
export function calendarForInstrument(instrumentId: string): MarketCalendar {
  const [exchange = '', ticker = ''] = instrumentId.split(':');
  return (exchange === 'NSE' || exchange === 'BSE') && DERIVATIVE.test(ticker) ? calendarFor('NFO') : calendarFor(exchange);
}

// Source: Kite minute data (owner's choice over circulars). Derivatives run to 15:40 since the closing-auction rollout.
const DERIVATIVES_1540_FROM = '2026-08-03';

function indianSessions(date: string, kind: 'cash' | 'derivatives' | 'mcx'): SessionWindow[] {
  const derivativesClose = date >= DERIVATIVES_1540_FROM ? '15:40' : '15:30';
  // Muhurat 2026 per data: 14:20 open. MCX had no Muhurat data, so it keeps the old window until verified.
  if (date === MUHURAT_2026) return kind === 'mcx' ? window(date, '18:00', '19:00', indiaTz) : window(date, '14:20', kind === 'derivatives' ? '15:40' : '15:30', indiaTz);
  if ([0, 6].includes(weekday(date))) return [];
  const holiday = INDIA_HOLIDAYS.find(value => value.date === date);
  const close = newYorkDst(localTime(date, '12:00', usTz)) ? '23:55' : '23:30';
  if (holiday) return kind === 'mcx' && holiday.eveningOnly ? window(date, '17:00', close, indiaTz) : [];
  if (kind === 'mcx') return window(date, '09:00', close, indiaTz);
  return window(date, '09:15', kind === 'derivatives' ? derivativesClose : '15:30', indiaTz);
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
