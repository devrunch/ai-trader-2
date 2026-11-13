import { describe, expect, it } from 'vitest';
import type { Bar } from '../domain/bar';
import { StoredBars } from './stored-bars';
import type { StoredBarsReader } from './ports/stored-bars-reader';

// 2026-11-17 is a Tuesday; NSE 09:15-15:30 IST = 03:45-10:00 UTC.
const NOW = Date.parse('2026-11-17T06:07:00Z');
const bar = (time: number, close: number): Bar => ({ time, open: close, high: close + 1, low: close - 1, close, volume: 10 });
const minutes = (from: string, count: number, close = 100): Bar[] => Array.from({ length: count }, (_, i) => bar(Date.parse(from) + i * 60_000, close + i));

function reader(data: { d?: Record<string, Bar[]>; m?: Record<string, Bar[]> }) {
  const calls: Array<{ kind: '1d' | '1m'; ids: readonly string[] }> = [];
  const impl: StoredBarsReader = {
    range1d: (ids) => { calls.push({ kind: '1d', ids }); return Promise.resolve(new Map(ids.flatMap(id => (data.d?.[id] ? [[id, data.d[id]] as [string, Bar[]]] : [])))); },
    range1m: (ids) => { calls.push({ kind: '1m', ids }); return Promise.resolve(new Map(ids.flatMap(id => (data.m?.[id] ? [[id, data.m[id]] as [string, Bar[]]] : [])))); },
  };
  return { calls, store: new StoredBars(impl, () => NOW) };
}

describe('StoredBars.latest', () => {
  it('aggregates 1m bars into closed 15m bars on the session grid and drops the forming one', async () => {
    const { store } = reader({ m: { 'NSE:A': minutes('2026-11-17T03:45:00Z', 142) } });
    const got = (await store.latest(['NSE:A'], '15', 100)).get('NSE:A');
    // 03:45 to 06:06 stored; at 06:07 the 06:00 bar is still forming.
    expect(got?.bars.map(b => new Date(b.time).toISOString().slice(11, 16))).toEqual(['03:45', '04:00', '04:15', '04:30', '04:45', '05:00', '05:15', '05:30', '05:45']);
    expect(got?.bars[0]).toMatchObject({ open: 100, close: 114, high: 115, low: 99, volume: 150 });
    expect(got?.newestTime).toBe(Date.parse('2026-11-17T05:45:00Z'));
    expect(got?.stale).toBeNull();
  });

  it('caps at the newest limit bars, oldest first', async () => {
    const { store } = reader({ m: { 'NSE:A': minutes('2026-11-17T03:45:00Z', 142) } });
    const got = (await store.latest(['NSE:A'], '15', 3)).get('NSE:A');
    expect(got?.bars.map(b => b.time)).toEqual([Date.parse('2026-11-17T05:15:00Z'), Date.parse('2026-11-17T05:30:00Z'), Date.parse('2026-11-17T05:45:00Z')]);
  });

  it('reads 500 instruments x 100 daily bars in chunked batch queries, not per symbol', async () => {
    const ids = Array.from({ length: 500 }, (_, i) => `NSE:S${String(i)}`);
    const day = (n: number): Bar => bar(Date.parse('2026-06-01T18:30:00Z') + n * 86_400_000, 100 + n);
    const d = Object.fromEntries(ids.map(id => [id, Array.from({ length: 120 }, (_, n) => day(n))]));
    const { store, calls } = reader({ d });
    const started = performance.now();
    const result = await store.latest(ids, '1D', 100);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(calls.length).toBeLessThanOrEqual(5);
    expect(calls.every(c => c.kind === '1d')).toBe(true);
    expect(calls.flatMap(c => c.ids)).toHaveLength(500);
    expect(result.get('NSE:S7')?.bars).toHaveLength(100);
    expect(result.get('NSE:S7')?.bars[99]?.time).toBe(day(119).time);
  });

  it('drops the forming daily bar while the market is open', async () => {
    const today = Date.parse('2026-11-16T18:30:00Z');
    const { store } = reader({ d: { 'NSE:A': [bar(today - 86_400_000, 1), bar(today, 2)] } });
    const got = (await store.latest(['NSE:A'], '1D', 10)).get('NSE:A');
    expect(got?.bars.map(b => b.close)).toEqual([1]);
  });

  it('marks stale with a reason when the newest bar is old, or when there are no bars or no calendar', async () => {
    const { store } = reader({ d: { 'NSE:OLD': [bar(Date.parse('2026-11-01T18:30:00Z'), 1)] } });
    const got = await store.latest(['NSE:OLD', 'NSE:NONE', 'ZZZ:X'], '1D', 10);
    expect(got.get('NSE:OLD')?.stale).toBe('newest daily bar is 15 days old (limit 5)');
    expect(got.get('NSE:NONE')).toEqual({ bars: [], newestTime: null, stale: 'no stored bars' });
    expect(got.get('ZZZ:X')).toEqual({ bars: [], newestTime: null, stale: 'no market calendar for this instrument' });
  });
});
