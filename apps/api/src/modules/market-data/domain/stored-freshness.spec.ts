import { describe, expect, it } from 'vitest';
import { calendarFor } from './calendar';
import { isBarClosed, staleReason } from './stored-freshness';

const nse = calendarFor('NSE');
const at = (iso: string): number => Date.parse(iso);
// 2026-11-17 is a Tuesday; NSE session 09:15-15:30 IST = 03:45-10:00 UTC.
const MIN = 60_000;

describe('isBarClosed', () => {
  it('treats a 15m bar as forming until its interval has passed', () => {
    const start = at('2026-11-17T04:00:00Z');
    expect(isBarClosed(start, '15', at('2026-11-17T04:10:00Z'), nse)).toBe(false);
    expect(isBarClosed(start, '15', at('2026-11-17T04:15:00Z'), nse)).toBe(true);
  });
  it('treats the last bar of a session as closed once the session ends', () => {
    expect(isBarClosed(at('2026-11-17T09:45:00Z'), '15', at('2026-11-17T10:01:00Z'), nse)).toBe(true);
  });
  it('treats the daily bar as forming only while its market is open', () => {
    const day = at('2026-11-16T18:30:00Z');
    expect(isBarClosed(day, '1D', at('2026-11-17T05:00:00Z'), nse)).toBe(false);
    expect(isBarClosed(day, '1D', at('2026-11-17T11:00:00Z'), nse)).toBe(true);
  });
});

describe('staleReason', () => {
  it('says there are no bars when none are stored', () => {
    expect(staleReason(null, '15', at('2026-11-17T05:00:00Z'), nse)).toBe('no stored bars');
  });
  it('is fresh within 3 intervals of market time', () => {
    const newest = at('2026-11-17T04:00:00Z');
    expect(staleReason(newest, '15', newest + 45 * MIN, nse)).toBeNull();
    expect(staleReason(newest, '15', newest + 46 * MIN, nse)).toBe('newest bar is 46 min old during market hours (limit 45)');
  });
  it('does not count closed hours: Friday close is fresh at Monday open', () => {
    const newest = at('2026-11-20T09:45:00Z');
    expect(staleReason(newest, '15', at('2026-11-23T03:50:00Z'), nse)).toBeNull();
  });
  it('flags a daily bar older than 5 days', () => {
    const newest = at('2026-11-02T18:30:00Z');
    expect(staleReason(newest, '1D', newest + 5 * 86_400_000, nse)).toBeNull();
    expect(staleReason(newest, '1D', newest + 6 * 86_400_000, nse)).toBe('newest daily bar is 6 days old (limit 5)');
  });
});
