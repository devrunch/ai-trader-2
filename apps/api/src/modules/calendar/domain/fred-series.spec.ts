import { describe, expect, it } from 'vitest';
import { FRED_MAPPINGS, formatRelease, referenceDate } from './fred-series';

const at = (iso: string): number => Date.parse(iso);
const values = (entries: Array<[string, number]>): Map<string, number> => new Map(entries);

describe('referenceDate', () => {
  it('uses the first of the previous month for a monthly release', () => {
    expect(referenceDate('prev-month', at('2026-11-12T13:30:00Z'))).toBe('2026-10-01');
    expect(referenceDate('prev-month', at('2027-01-14T13:30:00Z'))).toBe('2026-12-01');
  });
  it('uses the first of the previous quarter for GDP', () => {
    expect(referenceDate('prev-quarter', at('2026-10-29T12:30:00Z'))).toBe('2026-07-01');
    expect(referenceDate('prev-quarter', at('2026-12-23T13:30:00Z'))).toBe('2026-07-01');
    expect(referenceDate('prev-quarter', at('2027-01-28T13:30:00Z'))).toBe('2026-10-01');
  });
  it('uses the Saturday ending the week before a Thursday claims release, and the event day for a rate decision', () => {
    expect(referenceDate('prev-saturday', at('2026-11-12T13:30:00Z'))).toBe('2026-11-07');
    expect(referenceDate('event-day', at('2026-12-09T19:00:00Z'))).toBe('2026-12-09');
  });
});

describe('formatRelease', () => {
  it('turns an index into a rounded m/m and y/y percent', () => {
    const v = values([['2026-09-01', 321.4], ['2026-10-01', 322.4], ['2025-10-01', 313]]);
    expect(formatRelease({ kind: 'pct-change', lagMonths: 1 }, '2026-10-01', v)).toBe('0.3%');
    expect(formatRelease({ kind: 'pct-change', lagMonths: 12 }, '2026-10-01', v)).toBe('3.0%');
    expect(formatRelease({ kind: 'pct-change', lagMonths: 1 }, '2026-10-01', values([['2026-10-01', 100], ['2026-09-01', 100.04]]))).toBe('0.0%');
  });
  it('formats levels, payroll changes and claims the way ForexFactory prints them', () => {
    expect(formatRelease({ kind: 'level', decimals: 1, suffix: '%' }, '2026-10-01', values([['2026-10-01', 4.4]]))).toBe('4.4%');
    expect(formatRelease({ kind: 'level', decimals: 2, suffix: '%' }, '2026-12-09', values([['2026-12-09', 3.75]]))).toBe('3.75%');
    expect(formatRelease({ kind: 'diff-thousands' }, '2026-10-01', values([['2026-09-01', 160_300], ['2026-10-01', 160_525]]))).toBe('225K');
    expect(formatRelease({ kind: 'thousands' }, '2026-11-07', values([['2026-11-07', 224_000]]))).toBe('224K');
  });
  it('returns null when the period or its comparison month is missing', () => {
    expect(formatRelease({ kind: 'pct-change', lagMonths: 1 }, '2026-10-01', values([['2026-10-01', 322.4]]))).toBeNull();
    expect(formatRelease({ kind: 'level', decimals: 1, suffix: '%' }, '2026-10-01', values([]))).toBeNull();
  });
  it('maps the curated USD titles', () => { expect(FRED_MAPPINGS['CPI m/m']?.series).toBe('CPIAUCSL'); expect(Object.keys(FRED_MAPPINGS)).toHaveLength(16); });
});
