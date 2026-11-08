import { describe, expect, it } from 'vitest';
import { calendarFor } from './calendar';
import { bucketStart } from './grid';

const at = Date.parse;
// FR-CH-6, E12, E13.
describe('session grid', () => {
  it('tick on 09:16:00.000 IST belongs to the 09:16 bar', () => {
    const time = at('2026-11-09T09:16:00+05:30');
    expect(bucketStart(time, '1', calendarFor('NSE'))).toBe(time);
  });
  it('nse 15m last bucket is 15:15-15:30', () => {
    expect(bucketStart(at('2026-11-09T15:29:59+05:30'), '15', calendarFor('NSE'))).toBe(at('2026-11-09T15:15:00+05:30'));
  });
  it('us 60m buckets anchor at 09:30 across a DST change', () => {
    for (const [date, offset] of [['2026-03-06', '-05:00'], ['2026-03-09', '-04:00']] as const) {
      expect(bucketStart(at(`${date}T10:29:59${offset}`), '60', calendarFor('NYSE'))).toBe(at(`${date}T09:30:00${offset}`));
    }
  });
  it('fx 1D bucket rolls at 17:00 New York', () => {
    const cal = calendarFor('FX');
    expect(bucketStart(at('2026-06-01T20:59:59Z'), '1D', cal)).toBe(at('2026-05-31T21:00:00Z'));
    expect(bucketStart(at('2026-06-01T21:00:00Z'), '1D', cal)).toBe(at('2026-06-01T21:00:00Z'));
    expect(bucketStart(at('2026-11-09T22:00:00Z'), '1D', cal)).toBe(at('2026-11-09T22:00:00Z'));
  });
  it('outside session returns null', () => {
    expect(bucketStart(at('2026-11-09T09:10:00+05:30'), '1', calendarFor('NSE'))).toBeNull();
    expect(bucketStart(at('2026-01-26T10:00:00+05:30'), '1D', calendarFor('NSE'))).toBeNull();
  });
  it('anchors daily weekly and monthly bars to local calendar dates', () => {
    const time = at('2026-11-11T12:00:00+05:30');
    for (const [interval, day] of [['1D', '11'], ['1W', '09'], ['1M', '01']] as const) expect(bucketStart(time, interval, calendarFor('NSE'))).toBe(at(`2026-11-${day}T00:00:00+05:30`));
  });
  it('anchors FX intraday bars to the epoch', () => {
    const time = at('2026-11-09T12:05:00Z');
    expect(bucketStart(time, '240', calendarFor('FX'))).toBe(at('2026-11-09T12:00:00Z'));
  });
});
