import { describe, expect, it } from 'vitest';
import { calendarFor, holidaysKnownThrough } from './calendar';

const at = Date.parse;
// FR-CH-6, E13: session boundaries and exchange-local dates.
describe('market calendars', () => {
  it('dates beyond the curated list are treated as normal weekdays and holidaysKnownThrough reports the boundary', () => {
    for (const id of ['NSE', 'BSE', 'NFO', 'MCX']) {
      expect(holidaysKnownThrough(id)).toBe('2026-12-31');
      expect(calendarFor(id).sessionsOn('2027-01-26')).toHaveLength(1);
      expect(calendarFor(id).sessionsOn('2027-01-30')).toEqual([]);
    }
    for (const id of ['NYSE', 'NASDAQ', 'NYSEARCA', 'AMEX', 'CBOE', 'IEX', 'FX', 'OANDA']) expect(holidaysKnownThrough(id)).toBe('9999-12-31');
  });
  it('nse is closed on a 2026 trading holiday', () => {
    expect(calendarFor('NSE').sessionsOn('2026-01-26')).toEqual([]);
  });
  it('nse pre-open builds no session window', () => {
    expect(calendarFor('NSE').sessionContaining(at('2026-11-09T09:14:59+05:30'))).toBeNull();
  });
  it('mcx closes 23:55 during US DST and 23:30 otherwise', () => {
    const cal = calendarFor('MCX');
    expect(cal.sessionsOn('2026-06-01')).toEqual([{ open: at('2026-06-01T09:00:00+05:30'), close: at('2026-06-01T23:55:00+05:30') }]);
    expect(cal.sessionsOn('2026-12-01')[0]?.close).toBe(at('2026-12-01T23:30:00+05:30'));
  });
  it('nyse half day after Thanksgiving closes 13:00', () => {
    expect(calendarFor('NYSE').sessionsOn('2026-11-27')).toEqual([{ open: at('2026-11-27T09:30:00-05:00'), close: at('2026-11-27T13:00:00-05:00') }]);
  });
  it('nyse computes observed holidays', () => {
    const cal = calendarFor('NYSE');
    for (const day of ['2026-07-03', '2027-07-05', '2027-06-18', '2026-04-03']) expect(cal.sessionsOn(day)).toEqual([]);
    expect(cal.sessionsOn('2027-12-31')).toHaveLength(1);
  });
  it('fx is open Sunday 22:00 UTC and closed Saturday', () => {
    const cal = calendarFor('FX');
    expect(cal.isOpen(at('2026-11-08T22:00:00Z'))).toBe(true);
    expect(cal.isOpen(at('2026-11-07T22:00:00Z'))).toBe(false);
    expect(cal.isOpen(at('2026-11-13T22:00:00Z'))).toBe(false);
  });
  it('nextOpen skips weekends and holidays', () => {
    expect(calendarFor('NSE').nextOpen(at('2026-01-23T16:00:00+05:30'))).toBe(at('2026-01-27T09:15:00+05:30'));
  });
  it('honours the Muhurat special session on a Sunday (window from Kite data)', () => {
    expect(calendarFor('NSE').sessionsOn('2026-11-08')).toEqual([{ open: at('2026-11-08T14:20:00+05:30'), close: at('2026-11-08T15:30:00+05:30') }]);
  });
  it('opens only the curated MCX evening session on Holi', () => {
    expect(calendarFor('MCX').sessionsOn('2026-03-03')).toEqual([{ open: at('2026-03-03T17:00:00+05:30'), close: at('2026-03-03T23:30:00+05:30') }]);
    expect(calendarFor('MCX').sessionsOn('2026-01-26')).toEqual([]);
  });
  it('maps all supported exchange aliases', () => {
    for (const exchange of ['NSE', 'BSE', 'NFO', 'MCX', 'FX', 'OANDA', 'NASDAQ', 'NYSE', 'NYSEARCA', 'AMEX', 'CBOE', 'IEX']) expect(calendarFor(exchange).isOpen(at('2026-11-09T15:00:00Z'))).toBeTypeOf('boolean');
    expect(calendarFor('NFO').id).toBe('NFO'); // derivatives keep their own, longer session
  });
});
