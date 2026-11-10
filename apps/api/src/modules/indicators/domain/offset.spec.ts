import { describe, expect, it } from 'vitest';
import { OffsetStream, shiftByOffset } from './offset';

describe('shiftByOffset (TradingView plot offset)', () => {
  it('returns the series unchanged for offset 0', () => {
    expect(shiftByOffset([1, 2, 3], 0)).toEqual([1, 2, 3]);
  });

  it('moves values right for a positive offset and drops what falls past the last bar', () => {
    expect(shiftByOffset([1, 2, 3, 4], 2)).toEqual([null, null, 1, 2]);
  });

  it('moves values left for a negative offset and leaves the newest bars empty', () => {
    expect(shiftByOffset([1, 2, 3, 4], -1)).toEqual([2, 3, 4, null]);
    expect(shiftByOffset([1, 2], -5)).toEqual([null, null]);
  });
});

describe('OffsetStream', () => {
  const run = (offset: number, raw: number[], ticks: [time: number, value: number][]) => {
    const stream = new OffsetStream(offset);
    raw.forEach((value, i) => { stream.push(i * 10, value, false); });
    return ticks.map(([time, value]) => stream.push(time, value, time === (raw.length - 1) * 10));
  };

  it('emits the newest bar as computed for offset 0', () => {
    expect(run(0, [1, 2], [[10, 5], [20, 6]])).toEqual([{ time: 10, value: 5 }, { time: 20, value: 6 }]);
  });

  it('paints a positive offset on the newest bar from a closed bar, so ticks never move it', () => {
    // offset 2: displayed[n] = raw[n - 2]
    expect(run(2, [1, 2, 3], [[20, 9], [30, 4]])).toEqual([{ time: 20, value: 1 }, { time: 30, value: 2 }]);
  });

  it('paints a negative offset on an earlier bar from the forming value', () => {
    // offset -1: displayed[n - 1] = raw[n]
    expect(run(-1, [1, 2, 3], [[20, 9], [30, 4]])).toEqual([{ time: 10, value: 9 }, { time: 20, value: 4 }]);
  });

  it('returns null before enough bars exist to place the value', () => {
    const negative = new OffsetStream(-2);
    expect(negative.push(0, 1, false)).toBeNull();
    const positive = new OffsetStream(1);
    expect(positive.push(0, 1, false)).toEqual({ time: 0, value: null });
  });

  it('agrees with shiftByOffset after the same bars', () => {
    const raw = [3, 1, 4, 1, 5, 9, 2, 6];
    for (const offset of [-3, -1, 0, 1, 3]) {
      const stream = new OffsetStream(offset);
      const painted = new Map<number, number | null>();
      raw.forEach((value, i) => { const point = stream.push(i, value, false); if (point) painted.set(point.time, point.value); });
      const shifted = shiftByOffset(raw, offset);
      for (const [time, value] of painted) expect(value).toBe(shifted[time]);
    }
  });
});
