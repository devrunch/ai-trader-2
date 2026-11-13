import type { FundamentalField, ScanResult, ScreenSpec } from '@aitrader/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { Bar } from '../domain/derived-series';
import { ScanService } from './scan';
import type { ResultCache, StoredBars } from './ports';

const DAY = 86_400_000;
const bars = (n: number, close: (i: number) => number, volume: (i: number) => number = () => 1000): Bar[] =>
  Array.from({ length: n }, (_, i) => ({ time: (i + 1) * DAY, open: close(i), high: close(i) + 1, low: close(i) - 1, close: close(i), volume: volume(i) }));
const stored = (b: Bar[], stale: string | null = null): StoredBars => ({ bars: b, newestTime: b.at(-1)?.time ?? null, stale });
const memoryCache = (): ResultCache & { entries: Map<string, ScanResult> } => {
  const entries = new Map<string, ScanResult>();
  return { entries, get: k => Promise.resolve(entries.get(k) ?? null), set: (k, r) => { entries.set(k, r); return Promise.resolve(); } };
};
const spec = (patch: Partial<ScreenSpec>): ScreenSpec => ({ universe: 'nifty50', interval: '1D', indicators: [], fundamentals: [], limit: 50, ...patch });

function setup(data: Record<string, StoredBars>, funds: Record<string, Partial<Record<FundamentalField, number | null>>> = {}) {
  const latest = vi.fn((symbols: string[]) => Promise.resolve(new Map(symbols.flatMap(s => data[s] ? [[s, data[s]] as const] : []))));
  const getMany = vi.fn((symbols: string[]) => Promise.resolve(new Map(symbols.flatMap(s => funds[s] ? [[s, funds[s]] as const] : []))));
  const computeOnBars = vi.fn((_spec: unknown, b: Bar[]) => ({ times: b.map(x => x.time), plots: [{ id: 'v', values: b.map((x, i) => i === b.length - 1 ? x.close / 10 : 50) }] }));
  const cache = memoryCache();
  const service = new ScanService({ universes: { list: () => Promise.resolve([]), members: () => Promise.resolve(Object.keys(data).map(symbol => ({ symbol, name: symbol.slice(4) }))) },
    bars: { latest }, indicators: { computeOnBars }, fundamentals: { getMany }, cache });
  return { service, latest, getMany, computeOnBars, cache };
}

describe('ScanService', () => {
  it('ranks top gainers by change percent over the last bar, with last, change, barTime and a 30-point spark', async () => {
    const mk = (prev: number, last: number) => stored(bars(40, i => i === 39 ? last : prev));
    const { service, latest } = setup({ 'NSE:A': mk(100, 103), 'NSE:B': mk(100, 110), 'NSE:C': mk(100, 95) });
    const result = await service.scan('u1', spec({ preset: 'top-gainers', limit: 2 }));
    expect(result.rows.map(r => r.symbol)).toEqual(['NSE:B', 'NSE:A']);
    expect(result.rows[0]).toMatchObject({ last: 110, changePct: 10, barTime: 40 * DAY, name: 'B' });
    expect(result.rows[0]?.spark).toHaveLength(30);
    expect(result).toMatchObject({ scanned: 3, matched: 3, asOfBar: 40 * DAY, stale: [], cached: false, preset: 'top-gainers' });
    expect(latest).toHaveBeenCalledTimes(1);
    expect(latest).toHaveBeenCalledWith(['NSE:A', 'NSE:B', 'NSE:C'], '1D', 30);
  });

  it('evaluates a preset on the latest bar only, reports its values, and lists stale or short symbols with reasons', async () => {
    const big = stored(bars(30, i => i === 29 ? 120 : 100, i => i === 29 ? 5000 : 1000));
    const quiet = stored(bars(30, () => 100));
    const { service } = setup({ 'NSE:UP': big, 'NSE:FLAT': quiet, 'NSE:OLD': stored(bars(30, () => 100), 'last bar is 3 days old'), 'NSE:NEW': stored(bars(5, () => 100)), 'NSE:GONE': stored([]) });
    const result = await service.scan('u1', spec({ preset: 'breakout-volume' }));
    expect(result.rows.map(r => [r.symbol, r.values])).toEqual([['NSE:UP', { volumeRatio: 5, highestHigh20: 101 }]]);
    expect(result.stale).toEqual([{ symbol: 'NSE:OLD', reason: 'last bar is 3 days old' }, { symbol: 'NSE:NEW', reason: 'only 5 bars stored; 21 needed' }, { symbol: 'NSE:GONE', reason: 'no stored bars' }]);
    expect(result.scanned).toBe(5);
  });

  it('computes declared indicators per symbol and evaluates custom conditions over them', async () => {
    const { service, computeOnBars } = setup({ 'NSE:A': stored(bars(30, i => i === 29 ? 300 : 100)), 'NSE:B': stored(bars(30, () => 100)) });
    const result = await service.scan('u1', spec({ indicators: [{ name: 'mine', indicatorId: 'rsi', inputs: { length: 14 } }],
      condition: { kind: 'compare', left: { kind: 'series', name: 'mine' }, op: 'gt', right: { kind: 'value', value: 20 } } }));
    expect(result.rows.map(r => [r.symbol, r.values])).toEqual([['NSE:A', { mine: 30 }]]);
    expect(computeOnBars).toHaveBeenCalledWith({ id: 'rsi', inputs: { length: 14 } }, expect.any(Array));
  });

  it('rejects unknown presets, unknown series, both preset and conditions, and universes over the cap', async () => {
    const { service } = setup({ 'NSE:A': stored(bars(30, () => 1)) });
    await expect(service.scan('u1', spec({ preset: 'nope' }))).rejects.toThrow('Unknown preset');
    await expect(service.scan('u1', spec({ condition: { kind: 'compare', left: { kind: 'series', name: 'zzz' }, op: 'gt', right: { kind: 'value', value: 1 } } }))).rejects.toThrow('Unknown series "zzz"');
    await expect(service.scan('u1', spec({ preset: '52w-high', interval: '15' }))).rejects.toThrow('runs on 1D only');
    const many = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`NSE:S${String(i)}`, stored(bars(3, () => 1))]));
    await expect(setup(many).service.scan('u1', spec({ preset: 'top-gainers' }))).rejects.toThrow('at most 500');
  });

  it('filters on fundamentals with one batched read; a symbol without cached data is not matched and is listed as stale', async () => {
    const d = { 'NSE:A': stored(bars(30, () => 100)), 'NSE:B': stored(bars(30, () => 100)), 'NSE:C': stored(bars(30, () => 100)) };
    const { service, getMany } = setup(d, { 'NSE:A': { pe: 12 }, 'NSE:B': { pe: 40 } });
    const result = await service.scan('u1', spec({ fundamentals: [{ field: 'pe', op: 'lt', value: 25 }] }));
    expect(result.rows.map(r => [r.symbol, r.values])).toEqual([['NSE:A', { pe: 12 }]]);
    expect(result.stale).toEqual([{ symbol: 'NSE:C', reason: 'no fundamentals cached' }]);
    expect(getMany).toHaveBeenCalledTimes(1);
  });

  it('serves a repeat scan of the same newest bar from the cache without recomputing', async () => {
    const { service, computeOnBars, cache } = setup({ 'NSE:A': stored(bars(30, () => 100)) });
    const s = spec({ indicators: [{ name: 'mine', indicatorId: 'rsi', inputs: {} }], condition: { kind: 'compare', left: { kind: 'series', name: 'mine' }, op: 'gt', right: { kind: 'value', value: 0 } } });
    await service.scan('u1', s);
    expect(cache.entries.size).toBe(1);
    const again = await service.scan('u1', s);
    expect(again.cached).toBe(true);
    expect(computeOnBars).toHaveBeenCalledTimes(1);
  });

  it('scans 500 symbols x 200 bars on 1D well inside the time bound with one bars read', async () => {
    const data = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`NSE:S${String(i)}`, stored(bars(200, j => 100 + Math.sin(j / 5 + i) * 10, j => 1000 + (j % 7) * 100))]));
    const { service, latest } = setup(data);
    const started = performance.now();
    const result = await service.scan('u1', spec({ preset: 'breakout-volume', limit: 200 }));
    expect(performance.now() - started).toBeLessThan(3000);
    expect(result.scanned).toBe(500);
    expect(latest).toHaveBeenCalledTimes(1);
  });
});
