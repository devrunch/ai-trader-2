import { describe, expect, it } from 'vitest';
import { addDaysToDate, dateAt, localTime, newYorkDst, periodStart, weekday } from './time';

// FR-CH-6, E13: no host timezone or ambient clock.
describe('calendar time arithmetic', () => {
  it('converts dates and times in the explicit timezone', () => {
    expect(localTime('2026-11-09', '09:15', 'Asia/Kolkata')).toBe(Date.parse('2026-11-09T03:45:00Z'));
    expect(dateAt(Date.parse('2026-11-08T23:30:00Z'), 'Asia/Kolkata')).toBe('2026-11-09');
    expect(weekday('2026-11-08')).toBe(0);
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('computes the precise New York DST transitions', () => {
    expect(newYorkDst(Date.parse('2026-03-08T06:59:59Z'))).toBe(false);
    expect(newYorkDst(Date.parse('2026-03-08T07:00:00Z'))).toBe(true);
    expect(newYorkDst(Date.parse('2026-11-01T05:59:59Z'))).toBe(true);
    expect(newYorkDst(Date.parse('2026-11-01T06:00:00Z'))).toBe(false);
  });
  it('starts ISO weeks on Monday across a year boundary', () => {
    expect(periodStart('2027-01-01', '1W', 'America/New_York')).toBe(Date.parse('2026-12-28T05:00:00Z'));
    expect(periodStart('2026-11-09', '1D', 'Asia/Kolkata')).toBe(Date.parse('2026-11-08T18:30:00Z'));
    expect(periodStart('2026-11-09', '1M', 'Asia/Kolkata')).toBe(Date.parse('2026-10-31T18:30:00Z'));
  });
});
