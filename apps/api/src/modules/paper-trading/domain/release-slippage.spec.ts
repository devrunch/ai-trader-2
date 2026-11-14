import { describe, expect, it } from 'vitest';
import { releaseSlippage } from './release-slippage';

const M = 60_000;
const R = 1_000 * M;

describe('releaseSlippage', () => {
  it('keeps the normal rate away from releases', () => {
    expect(releaseSlippage(0.0003, R - 3 * M, [R])).toBe(0.0003);
    expect(releaseSlippage(0.0003, R + 16 * M, [R])).toBe(0.0003);
    expect(releaseSlippage(0.0003, R, [])).toBe(0.0003);
  });
  it('widens just before, spikes in the first five minutes, and stays wide to fifteen', () => {
    expect(releaseSlippage(0.0003, R - M, [R])).toBeCloseTo(0.0009);
    expect(releaseSlippage(0.0003, R, [R])).toBeCloseTo(0.0018);
    expect(releaseSlippage(0.0003, R + 4 * M, [R])).toBeCloseTo(0.0018);
    expect(releaseSlippage(0.0003, R + 10 * M, [R])).toBeCloseTo(0.0009);
  });
  it('takes the worst of overlapping releases', () => {
    expect(releaseSlippage(0.0003, R + 10 * M, [R, R + 8 * M])).toBeCloseTo(0.0018);
  });
});
