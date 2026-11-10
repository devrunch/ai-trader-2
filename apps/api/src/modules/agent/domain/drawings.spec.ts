import { describe, expect, it } from 'vitest';
import { levels, pivots, range, trendline, type OhlcBar } from './drawings';

const MIN = 60_000;
/** A zig-zag: highs touch 110 three times and 120 once, lows touch 90 three times. */
function zigzag(): OhlcBar[] {
  const closes = [100, 105, 110, 105, 100, 95, 90, 95, 100, 105, 110, 105, 100, 95, 90, 95, 100, 105, 110, 115, 120, 115, 110, 105, 100, 95, 90, 95, 100];
  return closes.map((c, i) => ({ time: i * MIN, open: c, high: c + 0.2, low: c - 0.2, close: c }));
}

describe('drawings computed from bars (FR-AG-6)', () => {
  it('finds swing highs and lows with k bars on each side', () => {
    const { highs, lows } = pivots(zigzag(), 2);
    expect(highs.map(i => zigzag()[i]?.close)).toEqual([110, 110, 120]);
    expect(lows.map(i => zigzag()[i]?.close)).toEqual([90, 90, 90]);
  });

  it('levels: clusters touches and returns the most-touched prices, highest first', () => {
    const result = levels(zigzag(), 2, 2);
    expect(result.segments.map(s => Number(s.from.price.toFixed(1)))).toEqual([110.2, 89.8]);
    expect(result.segments[0]?.label).toMatch(/110\.20 · 2 touches/);
    expect(result.segments[1]?.label).toMatch(/89\.80 · 3 touches/);
    expect(result.segments.every(s => s.from.time === 0 && s.to.time === 28 * MIN)).toBe(true);
  });

  it('trendline: through the last two swing lows, extended to the last bar', () => {
    const bars = zigzag().map((b, i) => ({ ...b, low: b.low + i * 0.1, high: b.high + i * 0.1 }));
    const line = trendline(bars, 'support', 2);
    const [seg] = line.segments;
    expect(seg?.from.time).toBe(14 * MIN);
    expect(seg?.to.time).toBe(28 * MIN);
    expect(seg?.from.price).toBeCloseTo(89.8 + 1.4, 6);
    // Two lows (14 → 26) rise 1.2 over 12 bars; extended two more bars to the last one.
    expect(seg?.to.price).toBeCloseTo(89.8 + 2.6 + 0.2, 6);
  });

  it('trendline: says so plainly when there are not two swings', () => {
    const flat = Array.from({ length: 10 }, (_, i) => ({ time: i * MIN, open: 1, high: 1, low: 1, close: 1 }));
    expect(trendline(flat, 'resistance', 2)).toEqual({ segments: [], note: 'Fewer than two swing highs in this window; no trend line drawn.' });
  });

  it('range: the high and low between two times', () => {
    const result = range(zigzag(), 5 * MIN, 12 * MIN);
    expect(result.segments.map(s => [s.label.split(' ')[0], s.from.price])).toEqual([['High', 110.2], ['Low', 89.8]]);
    expect(range(zigzag(), 100 * MIN, 200 * MIN)).toMatchObject({ segments: [], note: 'No bars in that time range.' });
  });
});
