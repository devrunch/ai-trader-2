import { describe, expect, it } from 'vitest';
import { isFresh, periodEnd, visibleAt } from './visibility';

describe('visibleAt (time machine, DATA-SOURCES rule 6)', () => {
  const record = { fetchedAt: '2026-03-10T00:00:00.000Z', reportDate: '2025-12-31' };
  it('hides a record fetched after asOf', () => {
    expect(visibleAt(record, Date.parse('2026-03-09T23:59:59Z'))).toBe(false);
    expect(visibleAt(record, Date.parse('2026-03-10T00:00:00Z'))).toBe(true);
  });
  it('hides a record whose results period had not ended at asOf', () => {
    expect(visibleAt({ fetchedAt: '2026-01-01T00:00:00.000Z', reportDate: '2026-03-31' }, Date.parse('2026-02-01T00:00:00Z'))).toBe(false);
  });
  it('shows a record with no report date once fetched', () => {
    expect(visibleAt({ fetchedAt: '2026-01-01T00:00:00.000Z', reportDate: null }, Date.parse('2026-02-01T00:00:00Z'))).toBe(true);
  });
});

describe('isFresh', () => {
  it('is fresh under 24 hours and stale from 24 hours', () => {
    const r = { fetchedAt: '2026-03-10T00:00:00.000Z', reportDate: null };
    expect(isFresh(r, Date.parse('2026-03-10T23:59:59Z'))).toBe(true);
    expect(isFresh(r, Date.parse('2026-03-11T00:00:00Z'))).toBe(false);
  });
});

describe('periodEnd', () => {
  it('maps month headings to the last day and rejects other headings', () => {
    expect(periodEnd('Sep 2025')).toBe('2025-09-30');
    expect(periodEnd('Feb 2024')).toBe('2024-02-29');
    expect(periodEnd('TTM')).toBeNull();
    expect(periodEnd('')).toBeNull();
  });
});
