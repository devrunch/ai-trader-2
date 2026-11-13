import type { ScanResult, ScreenSpec } from '@aitrader/contracts';
import { describe, expect, it, vi } from 'vitest';
import { buildScreenerTools } from './screener-tools';

const ctx = { userId: 'u1', conversationId: '7d9f0a2e-0000-4000-8000-000000000001', turnId: 'turn-abcdef12' };
const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined, clock: () => 0 };
const rows = Array.from({ length: 3 }, (_, i) => ({ symbol: `NSE:S${String(i)}`, name: null, last: 100 + i, changePct: i, barTime: 1_700_000_000_000, values: { rsi: 25 + i }, spark: [1, 2] }));
const result: ScanResult = { universe: 'nifty50', interval: '1D', preset: 'rsi-oversold', asOfBar: 1_700_000_000_000, scanned: 50, matched: 3, rows,
  stale: [{ symbol: 'NSE:X', reason: 'no stored bars' }], durationMs: 5, cached: false };

function setup() {
  const scan = vi.fn<(userId: string, spec: ScreenSpec) => Promise<ScanResult>>(() => Promise.resolve(result));
  const create = vi.fn(() => Promise.resolve({ id: 't1' }));
  const tools = buildScreenerTools({ scan }, [{ id: 'rsi-oversold', name: 'RSI oversold', description: 'RSI below 30' }], { create }, deps);
  return { scan, create, byName: (n: string) => tools.find(t => t.name === n) };
}

describe('screener tools', () => {
  it('scanUniverse returns the rows, the counts, the bar time and the source, with the default limit of 15', async () => {
    const { scan, byName } = setup();
    const out = await byName('scanUniverse')?.call(ctx, { universe: 'nifty50', preset: 'rsi-oversold' });
    expect(out).toEqual({ ok: true, data: { universe: 'nifty50', interval: '1D', preset: 'rsi-oversold', asOfBar: '2023-11-14T22:13:20.000Z', source: 'stored bars', scanned: 50, matched: 3, stale: 1,
      staleSample: [{ symbol: 'NSE:X', reason: 'no stored bars' }], cached: false, rows: rows.map(({ symbol, name, last, changePct, values }) => ({ symbol, name, last, changePct, values })) } });
    expect(scan).toHaveBeenCalledWith('u1', expect.objectContaining({ preset: 'rsi-oversold', interval: '1D', limit: 15 }));
  });

  it('scanUniverse accepts conditions and indicators as JSON strings, and rejects a limit over 30 or an empty screen', async () => {
    const { scan, byName } = setup();
    const condition = JSON.stringify({ kind: 'compare', left: { kind: 'series', name: 'mine' }, op: 'lt', right: { kind: 'value', value: 30 } });
    const indicators = JSON.stringify([{ name: 'mine', indicatorId: 'rsi', inputs: { length: 14 } }]);
    expect(await byName('scanUniverse')?.call(ctx, { universe: 'nifty50', condition, indicators, limit: 5 })).toMatchObject({ ok: true });
    expect(scan).toHaveBeenCalledWith('u1', expect.objectContaining({ condition: expect.objectContaining({ op: 'lt' }) as unknown, indicators: [{ name: 'mine', indicatorId: 'rsi', inputs: { length: 14 } }], limit: 5 }));
    expect(await byName('scanUniverse')?.call(ctx, { universe: 'nifty50', preset: 'gap-up', limit: 31 })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
    expect(await byName('scanUniverse')?.call(ctx, { universe: 'nifty50' })).toMatchObject({ ok: false, reason: 'VALIDATION_FAILED' });
  });

  it('watchScreen creates a screen trigger task in the caller\'s thread with a plain title, and a desk placeholder replaced at fire time', async () => {
    const { create, byName } = setup();
    expect(await byName('watchScreen')?.call(ctx, { universe: 'nifty50', preset: 'gap-up', desk: {} })).toMatchObject({ ok: true });
    expect(create).toHaveBeenCalledWith('u1', ctx.conversationId, expect.objectContaining({ title: 'Screen: gap-up on nifty50 1D', maxRuns: 10, expiresInDays: 7, desk: { symbol: 'NSE:NIFTY', rounds: 1 },
      trigger: { kind: 'screen', spec: expect.objectContaining({ preset: 'gap-up', universe: 'nifty50' }) as unknown } }));
  });
});
