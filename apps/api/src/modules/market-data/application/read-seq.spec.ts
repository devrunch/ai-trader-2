import { describe, expect, it } from 'vitest';
import { ReadSeq } from './read-seq';
import type { BarSequenceStore } from './ports/bar-sequence-store';

describe('ReadSeq (FR-LS-2, E16)', () => {
  it('returns null when replay history is too old and an empty list when up to date', async () => {
    const store: BarSequenceStore = { current: () => Promise.resolve(4), updates: () => Promise.resolve([
      { instrumentId: 'NSE:TEST', seq: 3, kind: 'forming', bar: { time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }, at: 1 },
      { instrumentId: 'NSE:TEST', seq: 4, kind: 'forming', bar: { time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }, at: 1 },
    ]) };
    const reader = new ReadSeq(store);
    await expect(reader.replay('NSE:TEST', 1)).resolves.toBeNull();
    await expect(reader.replay('NSE:TEST', 4)).resolves.toEqual([]);
  });

  it('returns null when history is empty but the current sequence is ahead', async () => {
    const reader = new ReadSeq({ current: () => Promise.resolve(2), updates: () => Promise.resolve([]) });
    await expect(reader.replay('NSE:TEST', 1)).resolves.toBeNull();
    await expect(reader.replay('NSE:TEST', 2)).resolves.toEqual([]);
  });
});
