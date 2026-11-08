import { describe, expect, it } from 'vitest';
import { aggregate } from './aggregate';
import type { Bar } from './bar';
import { calendarFor } from './calendar';

const start = Date.parse('2026-11-09T09:15:00+05:30');
const sample = (i: number): Bar => ({ time: start + i * 60000, open: 10 + i, high: 20 + i, low: 5 + i, close: 15 + i, volume: i + 1 });
const bars: Bar[] = Array.from({ length: 6 }, (_, i) => sample(i));
// FR-CH-6.
describe('aggregation', () => {
  it('aggregates 1m to 5m on the session grid', () => {
    expect(aggregate(bars, '5', calendarFor('NSE'))).toEqual([{ time: start, open: 10, high: 24, low: 5, close: 19, volume: 15 }, bars[5]]);
  });
  it('volume is null when all inputs are null', () => {
    expect(aggregate(bars.map(bar => ({ ...bar, volume: null })), '5', calendarFor('NSE'))[0]?.volume).toBeNull();
  });
  it('repaired propagates', () => {
    expect(aggregate(bars.map((bar, i) => ({ ...bar, repaired: i === 1 })), '5', calendarFor('NSE'))[0]?.repaired).toBe(true);
  });
  it('ignores bars outside sessions and sums mixed nullable volume', () => {
    expect(aggregate([{ ...sample(0), time: start - 60000 }, { ...sample(0), volume: null }, sample(1)], '5', calendarFor('NSE'))).toEqual([{ ...sample(0), high: 21, close: 16, volume: 2 }]);
    expect(aggregate([], '1D', calendarFor('NSE'))).toEqual([]);
  });
});
