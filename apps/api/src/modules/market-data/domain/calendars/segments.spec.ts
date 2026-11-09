import { describe, expect, it } from 'vitest';
import { calendarFor, calendarForInstrument } from './factory';

const ist = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+05:30`);

// Source: Kite minute data in our store (2026-10-09 to 2026-11-09); the owner chose data over circulars.
describe('Indian sessions from data', () => {
  it('derivatives trade until 15:40 since the 2026-08-03 closing-auction rollout', () => {
    expect(calendarFor('NFO').sessionsOn('2026-11-09')).toEqual([{ open: ist('2026-11-09', '09:15'), close: ist('2026-11-09', '15:40') }]);
    expect(calendarFor('NFO').sessionsOn('2026-07-31')).toEqual([{ open: ist('2026-07-31', '09:15'), close: ist('2026-07-31', '15:30') }]);
  });

  it('cash and indices still close at 15:30', () => {
    expect(calendarFor('NSE').sessionsOn('2026-11-09')).toEqual([{ open: ist('2026-11-09', '09:15'), close: ist('2026-11-09', '15:30') }]);
  });

  it('Muhurat 2026 ran 14:20–15:30 for cash and to 15:40 for derivatives', () => {
    expect(calendarFor('NSE').sessionsOn('2026-11-08')).toEqual([{ open: ist('2026-11-08', '14:20'), close: ist('2026-11-08', '15:30') }]);
    expect(calendarFor('NFO').sessionsOn('2026-11-08')).toEqual([{ open: ist('2026-11-08', '14:20'), close: ist('2026-11-08', '15:40') }]);
  });

  it('a futures tick at 15:35 is inside the session; a stock tick is not', () => {
    expect(calendarForInstrument('NSE:NIFTYX2026').isOpen(ist('2026-11-09', '15:35'))).toBe(true);
    expect(calendarForInstrument('NSE:RELIANCE').isOpen(ist('2026-11-09', '15:35'))).toBe(false);
  });
});

describe('calendarForInstrument', () => {
  it.each([
    ['NSE:NIFTYX2026', 'NFO'], ['NSE:BANKNIFTYZ2026', 'NFO'], ['NSE:NIFTY1!', 'NFO'], ['NSE:ZYDUSLIFE270125P1420', 'NFO'],
    ['NSE:RELIANCE', 'NSE'], ['NSE:NIFTY', 'NSE'], ['BSE:SENSEX', 'BSE'], ['MCX:GOLDZ2026', 'MCX'], ['FX:EURUSD', 'FX'], ['NASDAQ:AAPL', 'NASDAQ'],
  ])('%s uses the %s calendar', (id, calendar) => {
    expect(calendarForInstrument(id).id).toBe(calendar);
  });
});
