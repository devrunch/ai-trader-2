import { expect, it } from 'vitest';
import { generateDates, toOffsetIso } from './desk-dates';

it('generates dates every N days from start to end inclusive', () => {
  expect(generateDates('2026-01-01', '2026-01-22', 7)).toEqual({ dates: ['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22'], count: 4, error: null });
});
it('allows exactly 30 dates', () => {
  const r = generateDates('2026-01-01', '2026-01-30', 1);
  expect(r.count).toBe(30);
  expect(r.dates).toHaveLength(30);
  expect(r.error).toBeNull();
});
it('refuses more than 30 dates and says how many were asked for', () => {
  const r = generateDates('2026-01-01', '2026-01-31', 1);
  expect(r.dates).toEqual([]);
  expect(r.count).toBe(31);
  expect(r.error).toBe('31 dates is more than the limit of 30: widen the step or shorten the range.');
});
it('refuses an end before the start, a bad step and missing dates', () => {
  expect(generateDates('2026-02-01', '2026-01-01', 7).error).toContain('End date');
  expect(generateDates('2026-01-01', '2026-01-10', 0).error).toContain('Step');
  expect(generateDates('', '2026-01-10', 7).error).toContain('start and end');
});
it('converts a local date-time to an ISO string with the browser offset', () => {
  expect(toOffsetIso('2020-11-10T10:30')).toMatch(/^2020-11-10T10:30:00[+-]\d\d:\d\d$/);
  expect(toOffsetIso('garbage')).toBeNull();
});
