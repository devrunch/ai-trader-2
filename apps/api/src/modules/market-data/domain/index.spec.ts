import { expect, it } from 'vitest';
import { aggregate, BarBuilder, bucketStart, calendarFor, holidaysKnownThrough, INTERVALS, intervalMinutes, mergeRepair, parseInterval } from './index';
import type { Bar, Interval, MarketCalendar, SessionWindow } from './index';

it('exports the market-data domain API (FR-CH-6, FR-MD-2)', () => {
  const interval: Interval = parseInterval('1');
  const cal: MarketCalendar = calendarFor('NSE');
  const sessions: SessionWindow[] = cal.sessionsOn('2026-11-09');
  const bars: Bar[] = aggregate([], interval, cal);
  expect([BarBuilder, bucketStart, mergeRepair]).toHaveLength(3);
  expect(sessions).toHaveLength(1);
  expect(INTERVALS).toContain(interval);
  expect(intervalMinutes(interval)).toBe(1);
  expect(bars).toEqual([]);
  expect(holidaysKnownThrough(cal.id)).toBe('2026-12-31');
});
