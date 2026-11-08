import { describe, expect, it } from 'vitest';
import { usHalfDay, usHoliday } from './us';

// E13: observed fixed dates, computed floating holidays and half days.
describe('US holiday rules', () => {
  it('computes every 2026 NYSE holiday', () => {
    for (const day of ['01-01', '01-19', '02-16', '04-03', '05-25', '06-19', '07-03', '09-07', '11-26', '12-25']) expect(usHoliday(`2026-${day}`)).toBe(true);
    expect(usHoliday('2026-11-09')).toBe(false);
  });
  it('observes Sunday holidays on Monday and Saturday holidays on Friday', () => {
    for (const day of ['2027-06-18', '2027-07-05', '2027-12-24', '2023-01-02', '2022-12-26']) expect(usHoliday(day)).toBe(true);
    expect(usHoliday('2027-12-31')).toBe(false);
  });
  it('identifies the three curated early-close dates', () => {
    for (const day of ['2025-07-03', '2026-11-27', '2026-12-24']) expect(usHalfDay(day)).toBe(true);
    expect(usHalfDay('2026-11-25')).toBe(false);
  });
});
