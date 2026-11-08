import { describe, expect, it } from 'vitest';
import { INTERVALS, intervalMinutes, InvalidIntervalError, parseInterval } from './interval';

// FR-CH-6.
describe('intervals', () => {
  it('parses exactly the supported intervals', () => {
    expect(INTERVALS).toEqual(['1', '3', '5', '15', '30', '60', '240', '1D', '1W', '1M']);
    for (const interval of INTERVALS) expect(parseInterval(interval)).toBe(interval);
  });
  it('rejects unsupported intervals', () => {
    for (const value of ['', '2', '1d', ' 1', 'Infinity']) expect(() => parseInterval(value)).toThrow(InvalidIntervalError);
  });
  it('returns minutes only for intraday intervals', () => {
    expect(INTERVALS.map(intervalMinutes)).toEqual([1, 3, 5, 15, 30, 60, 240, null, null, null]);
  });
});
