import { describe, expect, it, vi } from 'vitest';
import type { Bar } from '@aitrader/contracts';
import { SeriesSync } from './series-sync';

const t0 = Date.UTC(2026, 10, 9, 3, 45);
const bar = (minute: number, close = 10): Bar => ({ time: t0 + minute * 60_000, open: 10, high: Math.max(10, close), low: 9, close, volume: 1 });

function sync() {
  const onReset = vi.fn<(bars: Bar[]) => void>();
  const onUpdate = vi.fn<(bar: Bar) => void>();
  return { s: new SeriesSync({ onReset, onUpdate }), onReset, onUpdate };
}

describe('SeriesSync (FR-LS-4, E10, E11)', () => {
  it('snapshot replaces state and resets the view', () => {
    const { s, onReset } = sync();
    s.applySnapshot([bar(0), bar(1)], 5);
    expect(onReset).toHaveBeenCalledWith([bar(0), bar(1)]);
    expect(s.lastSeq()).toBe(5);
    expect(s.lastBarTime()).toBe(bar(1).time);
  });

  it('duplicate and old seq are dropped', () => {
    const { s, onUpdate } = sync();
    s.applySnapshot([bar(0)], 5);
    expect(s.applyBar(5, bar(0, 11))).toBe('stale');
    expect(s.applyBar(4, bar(0, 12))).toBe('stale');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('a seq gap is reported and not applied', () => {
    const { s, onUpdate } = sync();
    s.applySnapshot([bar(0)], 5);
    expect(s.applyBar(7, bar(1))).toBe('gap');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(s.lastSeq()).toBe(5);
  });

  it('late correction updates the right bar', () => {
    const { s, onUpdate, onReset } = sync();
    s.applySnapshot([bar(0), bar(1), bar(2)], 1);
    expect(s.applyBar(2, bar(1, 20))).toBe('applied');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onReset).toHaveBeenLastCalledWith([bar(0), bar(1, 20), bar(2)]);
  });

  it('newest or next bar is pushed as an update', () => {
    const { s, onUpdate } = sync();
    s.applySnapshot([bar(0)], 1);
    expect(s.applyBar(2, bar(0, 15))).toBe('applied');
    expect(s.applyBar(3, bar(1, 16))).toBe('applied');
    expect(onUpdate.mock.calls.map(call => call[0])).toEqual([bar(0, 15), bar(1, 16)]);
    expect(s.lastSeq()).toBe(3);
  });

  it('mergeHistory is idempotent and server wins', () => {
    const { s, onReset } = sync();
    s.applySnapshot([bar(5), bar(6)], 1);
    s.mergeHistory([bar(3), bar(4), bar(5, 99)]);
    s.mergeHistory([bar(3), bar(4)]);
    expect(onReset).toHaveBeenLastCalledWith([bar(3), bar(4), bar(5, 99), bar(6)]);
  });

  it('a tick exactly on the bar boundary lands in the bar the server stamped', () => {
    const { s, onUpdate } = sync();
    s.applySnapshot([bar(0)], 1);
    s.applyBar(2, { ...bar(1), close: 12 });
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ time: t0 + 60_000, close: 12 }));
  });

  it('a snapshot keeps older history the view already paged in', () => {
    const { s, onReset } = sync();
    s.applySnapshot([bar(10), bar(11)], 1);
    s.mergeHistory([bar(8), bar(9)]);
    s.applySnapshot([bar(11), bar(12)], 9);
    expect(onReset).toHaveBeenLastCalledWith([bar(8), bar(9), bar(10), bar(11), bar(12)]);
  });

  it('a snapshot that does not overlap drops older history so no hole is drawn', () => {
    const { s, onReset } = sync();
    s.applySnapshot([bar(0), bar(1)], 1);
    s.applySnapshot([bar(50), bar(51)], 40);
    expect(onReset).toHaveBeenLastCalledWith([bar(50), bar(51)]);
  });
});
