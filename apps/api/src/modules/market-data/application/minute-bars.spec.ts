import { describe, expect, it } from 'vitest';
import type { Bar } from '../domain/bar';
import { MinuteBars } from './minute-bars';
import type { StoredBarsReader } from './ports/stored-bars-reader';

const T = Date.parse('2026-11-11T05:00:00Z');
const bar = (min: number, close: number): Bar => ({ time: T + min * 60_000, open: close - 1, high: close + 1, low: close - 2, close, volume: 10 });

function reader(data: Record<string, Bar[]>): StoredBarsReader & { calls: Array<[number, number]> } {
  const calls: Array<[number, number]> = [];
  return { calls, range1d: () => Promise.resolve(new Map()),
    range1m: (ids, from, to) => { calls.push([from, to]); return Promise.resolve(new Map(ids.flatMap(id => (data[id] ? [[id, data[id].filter(b => b.time >= from && b.time < to)] as [string, Bar[]]] : [])))); } };
}

describe('MinuteBars', () => {
  it('returns bars in [from, to) without volume', async () => {
    const bars = new MinuteBars(reader({ 'NSE:A': [bar(0, 100), bar(1, 101), bar(2, 102)] }));
    const out = await bars.window(['NSE:A', 'NSE:B'], T + 60_000, T + 120_000);
    expect(out.get('NSE:A')).toEqual([{ time: T + 60_000, open: 100, high: 102, low: 99, close: 101 }]);
    expect(out.has('NSE:B')).toBe(false);
  });

  it('computes change from the close of the minute N ago to the newest minute', async () => {
    const bars = new MinuteBars(reader({ 'NSE:A': [bar(0, 100), bar(5, 101), bar(10, 102)] }));
    const out = await bars.changePct(['NSE:A'], 10, T + 10 * 60_000 + 30_000);
    expect(out.get('NSE:A')).toBeCloseTo(2, 10);
  });

  it('uses the last bar before the reference minute when that minute has none', async () => {
    const bars = new MinuteBars(reader({ 'NSE:A': [bar(0, 100), bar(10, 105)] }));
    expect((await bars.changePct(['NSE:A'], 5, T + 10 * 60_000)).get('NSE:A')).toBeCloseTo(5, 10);
  });

  it('returns null with no bars or only one bar', async () => {
    const bars = new MinuteBars(reader({ 'NSE:A': [bar(10, 105)] }));
    const out = await bars.changePct(['NSE:A', 'NSE:Z'], 5, T + 10 * 60_000);
    expect(out.get('NSE:A')).toBeNull();
    expect(out.get('NSE:Z')).toBeNull();
  });
});
