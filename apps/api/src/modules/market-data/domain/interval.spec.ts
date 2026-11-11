import { describe, expect, it } from 'vitest';
import { INTERVALS, intervalMinutes, intervalSeconds, isSecondInterval, InvalidIntervalError, parseInterval } from './interval';

// FR-CH-6.
describe('intervals', () => {
  it('parses exactly the supported intervals', () => {
    expect(INTERVALS).toEqual(['1S', '5S', '15S', '30S', '1', '3', '5', '15', '30', '60', '240', '1D', '1W', '1M']);
    for (const interval of INTERVALS) expect(parseInterval(interval)).toBe(interval);
  });
  it('rejects unsupported intervals', () => {
    for (const value of ['', '2', '1d', ' 1', 'Infinity']) expect(() => parseInterval(value)).toThrow(InvalidIntervalError);
  });
  it('returns minutes only for intraday intervals', () => {
    expect(INTERVALS.map(intervalMinutes)).toEqual([null, null, null, null, 1, 3, 5, 15, 30, 60, 240, null, null, null]);
  });
  it('tells second intervals apart and reads their length', () => {
    expect(INTERVALS.filter(isSecondInterval)).toEqual(['1S', '5S', '15S', '30S']);
    expect([intervalSeconds('1S'), intervalSeconds('30S')]).toEqual([1, 30]);
  });
});
