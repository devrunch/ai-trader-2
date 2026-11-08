import { describe, expect, it } from 'vitest';
import { mergeRepair } from './repair';

const bar = { time: 1, open: 10, high: 12, low: 8, close: 11, volume: null };
// FR-MD-2.
describe('vendor repair', () => {
  it('vendor wins and marks repaired', () => {
    expect(mergeRepair([bar], [{ ...bar, close: 12 }])).toEqual({ bars: [{ ...bar, close: 12, repaired: true }], repairedCount: 1 });
  });
  it('keeps live-only bars', () => {
    expect(mergeRepair([bar], [])).toEqual({ bars: [bar], repairedCount: 0 });
  });
  it('sorts the union and leaves matching bars unchanged', () => {
    expect(mergeRepair([{ ...bar, time: 3 }, bar], [bar, { ...bar, time: 2 }])).toEqual({ bars: [bar, { ...bar, time: 2 }, { ...bar, time: 3 }], repairedCount: 0 });
  });
  it('repairs volume differences and is idempotent', () => {
    const vendor = [{ ...bar, volume: 0 }];
    const first = mergeRepair([bar], vendor);
    expect(first.repairedCount).toBe(1);
    expect(mergeRepair(first.bars, vendor)).toEqual({ bars: first.bars, repairedCount: 0 });
  });
});
