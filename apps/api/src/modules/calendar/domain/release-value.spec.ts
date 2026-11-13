import { describe, expect, it } from 'vitest';
import { parseReleaseValue, surprise, surpriseZ } from './release-value';

describe('parseReleaseValue', () => {
  it.each([
    ['0.3%', 0.3, '%'], ['-0.1%', -0.1, '%'], ['225K', 225, 'K'], ['1.2M', 1.2, 'M'], ['5.25%', 5.25, '%'], ['<0.1%', 0.1, '%'],
    ['1.2B', 1.2, 'B'], ['48.5', 48.5, ''], ['1,234.5', 1234.5, ''], [' -3.2T ', -3.2, 'T'], ['225k', 225, 'K'],
  ] as const)('reads %s', (text, value, unit) => { expect(parseReleaseValue(text)).toEqual({ value, unit }); });

  it.each(['', 'Hold', '3.1% / 3.3%', '4|1.2', '-', null, undefined])('returns null for %s', text => { expect(parseReleaseValue(text)).toBeNull(); });
});

describe('surprise', () => {
  it('is actual minus forecast in the same unit', () => {
    expect(surprise('0.4%', '0.3%')).toBe(0.1);
    expect(surprise('225K', '240K')).toBe(-15);
    expect(surprise('1,250', '1,200')).toBe(50);
  });
  it('is null when a side is unparsable or the units differ', () => {
    expect(surprise('Hold', '0.3%')).toBeNull();
    expect(surprise('0.4%', null)).toBeNull();
    expect(surprise('225K', '0.2M')).toBeNull();
  });
});

describe('surpriseZ', () => {
  const history = [1, -1, 1, -1, 1, -1, 1, -1];
  it('divides by the population standard deviation of the past surprises', () => {
    expect(surpriseZ(2, history)).toBe(2);
    expect(surpriseZ(-0.5, [0.1, 0.3, -0.1, 0.2, 0, 0.4, -0.2, 0.1])).toBe(-2.672612419);
  });
  it('is null with fewer than 8 past releases, no spread, or no surprise', () => {
    expect(surpriseZ(2, history.slice(0, 7))).toBeNull();
    expect(surpriseZ(2, new Array<number>(8).fill(0.1))).toBeNull();
    expect(surpriseZ(null, history)).toBeNull();
  });
});
