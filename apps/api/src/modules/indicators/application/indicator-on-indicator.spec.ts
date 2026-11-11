import { describe, expect, it, vi } from 'vitest';
import type { Bar, BarsResponse, IndicatorChartInstance, IndicatorComputeRequest } from '@aitrader/contracts';
import { NativeRuntime } from '../infrastructure/native/native-runtime';
import { fixtureBars } from '../infrastructure/native/bars.spec-helper';
import { IndicatorService } from './indicator.service';
import { RuntimeResolver } from './runtime-resolver';
import { SourcedInstance } from './sourced-instance';
import type { IndicatorInstance, PlotValues } from './ports/indicator-runtime';

const history = fixtureBars(300);
const service = () => new IndicatorService(
  { bars: vi.fn((symbol: string, interval: BarsResponse['interval'], _c: unknown, limit: number) => Promise.resolve<BarsResponse>({
    instrumentId: symbol, resolvedId: symbol, interval, bars: history.slice(-limit), nextBefore: null, status: { state: 'ok' } })) },
  new RuntimeResolver([new NativeRuntime()]), () => 'UTC');
const rsi: IndicatorChartInstance = { instanceId: 'rsi1', label: 'RSI 14', indicator: { kind: 'builtin', id: 'rsi', inputs: { length: 14 } } };
const obv: IndicatorChartInstance = { instanceId: 'obv1', label: 'OBV', indicator: { kind: 'builtin', id: 'obv', inputs: {} } };
const request = (indicator: IndicatorComputeRequest['indicator'], others: IndicatorChartInstance[], instanceId = 'sma1'): IndicatorComputeRequest =>
  ({ symbol: 'NSE:X', interval: '15', indicator, instanceId, label: 'SMA 5', others, range: { limit: 300 } });
const smaOf = (source: { from: string; plot: string }, length = 5) => ({ kind: 'builtin' as const, id: 'sma', inputs: { length, source } });

const sma = (values: (number | null)[], length: number): (number | null)[] => values.map((_, i) => {
  const window = values.slice(i - length + 1, i + 1);
  return i < length - 1 || window.some(v => v === null) ? null : window.reduce<number>((a, b) => a + (b ?? 0), 0) / length;
});

// FR-IN-13
describe('indicator on indicator', () => {
  it('SMA of RSI equals the SMA computed by hand over the RSI values', async () => {
    const svc = service();
    const parent = await svc.compute({ symbol: 'NSE:X', interval: '15', indicator: rsi.indicator, range: { limit: 300 } });
    const child = await svc.compute(request(smaOf({ from: 'rsi1', plot: 'rsi' }), [rsi]));
    const expected = sma(parent.plots[0]?.values ?? [], 5);
    expect(child.times).toEqual(parent.times);
    expect(child.plots[0]?.values).toHaveLength(300);
    child.plots[0]?.values.forEach((value, i) => {
      const want = expected[i] ?? null;
      if (want === null) expect(value).toBeNull(); else expect(value).toBeCloseTo(want, 9);
    });
    expect(child.plots[0]?.values.at(-1)).not.toBeNull();
    expect(child.inputs).toEqual({ length: 5, source: { from: 'rsi1', plot: 'rsi' }, offset: 0 });
  });

  it('chains A -> B -> C: SMA of SMA of OBV equals the hand-made chain', async () => {
    const svc = service();
    const b: IndicatorChartInstance = { instanceId: 'b', label: 'SMA 3', indicator: smaOf({ from: 'obv1', plot: 'obv' }, 3) };
    const parent = await svc.compute({ symbol: 'NSE:X', interval: '15', indicator: obv.indicator, range: { limit: 300 } });
    const child = await svc.compute(request(smaOf({ from: 'b', plot: 'ma' }, 4), [b, obv]));
    const expected = sma(sma(parent.plots[0]?.values ?? [], 3), 4);
    child.plots[0]?.values.forEach((value, i) => {
      const want = expected[i] ?? null;
      if (want === null) expect(value).toBeNull(); else expect(value).toBeCloseTo(want, 6);
    });
  });

  it('rejects a cycle by name, before reading any bars', async () => {
    const svc = service();
    const loop: IndicatorChartInstance = { instanceId: 'rsi1', label: 'RSI 14', indicator: { kind: 'builtin', id: 'rsi', inputs: { source: { from: 'sma1', plot: 'ma' } } } };
    await expect(svc.compute(request(smaOf({ from: 'rsi1', plot: 'rsi' }), [loop]))).rejects.toThrow('Indicators form a cycle: SMA 5 -> RSI 14 -> SMA 5');
  });

  // E28: the child reports the missing parent, and computes again once the parent is back.
  it('fails with source unavailable when the parent is gone and recovers when it returns', async () => {
    const svc = service();
    const child = smaOf({ from: 'rsi1', plot: 'rsi' });
    await expect(svc.compute(request(child, []))).rejects.toMatchObject({ details: { reason: 'SOURCE_UNAVAILABLE', from: 'rsi1' } });
    const back = await svc.compute(request(child, [rsi]));
    expect(back.plots[0]?.values.at(-1)).not.toBeNull();
  });

  it('reads enough bars for the parent to converge before the child starts', async () => {
    const bars = vi.fn((symbol: string, interval: BarsResponse['interval'], _c: unknown, limit: number) => Promise.resolve<BarsResponse>({
      instrumentId: symbol, resolvedId: symbol, interval, bars: history.slice(-limit), nextBefore: null, status: { state: 'ok' } }));
    const svc = new IndicatorService({ bars }, new RuntimeResolver([new NativeRuntime()]), () => 'UTC');
    await svc.compute({ ...request(smaOf({ from: 'rsi1', plot: 'rsi' }), [rsi]), range: { limit: 10 } });
    await svc.compute({ symbol: 'NSE:X', interval: '15', indicator: rsi.indicator, range: { limit: 10 } });
    const [child, plain] = bars.mock.calls.map(call => call[3]);
    expect(child).toBeGreaterThan(plain ?? 0);
  });

  it('live ticks on the forming bar then a new bar equal a fresh run of the chain', async () => {
    const svc = service();
    const open = await svc.open(request(smaOf({ from: 'rsi1', plot: 'rsi' }), [rsi]));
    const next = (time: number, close: number): Bar => ({ time, open: close, high: close + 1, low: close - 1, close, volume: 100 });
    const last = history.at(-1) as Bar;
    const ticks = [next(last.time + 900_000, 1001), next(last.time + 900_000, 1003), next(last.time + 900_000, 1002), next(last.time + 1_800_000, 1004)];
    let point;
    for (const tick of ticks) point = await open.stream.push(tick);
    open.stream.close();
    const all = [...history, ticks[2] as Bar, ticks[3] as Bar];
    const fresh = await new IndicatorService({ bars: () => Promise.resolve<BarsResponse>({ instrumentId: 'NSE:X', resolvedId: 'NSE:X', interval: '15', bars: all, nextBefore: null, status: { state: 'ok' } }) },
      new RuntimeResolver([new NativeRuntime()]), () => 'UTC').compute({ ...request(smaOf({ from: 'rsi1', plot: 'rsi' }), [rsi]), range: { limit: 400 } });
    expect(point?.values.ma).toBe(fresh.plots[0]?.values.at(-1));
    expect(point?.barTime).toBe(ticks[3]?.time);
  });
});

describe('SourcedInstance', () => {
  const bar = (time: number): Bar => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 });
  function recorder(name: string, log: string[], value: (b: Bar) => number | null): IndicatorInstance {
    const row = (b: Bar): PlotValues => ({ p: value(b) });
    return { seed: bars => { log.push(`${name}.seed`); return Promise.resolve(bars.map(row)); },
      update: (b, replace) => { log.push(`${name}.update${replace ? '*' : ''}`); return Promise.resolve(row(b)); }, close: () => { log.push(`${name}.close`); } };
  }

  it('updates the parent before the child on every bar, and closes both', async () => {
    const log: string[] = [];
    const sourced = new SourcedInstance(recorder('child', log, b => (b as Bar & { external?: number }).external ?? -1), recorder('parent', log, b => b.time), 'p');
    await sourced.seed([bar(1), bar(2)]);
    await sourced.update(bar(3), false);
    await sourced.update(bar(3), true);
    sourced.close();
    expect(log).toEqual(['parent.seed', 'child.update', 'child.update', 'parent.update', 'child.update', 'parent.update*', 'child.update*', 'parent.close', 'child.close']);
  });

  it('feeds the parent plot as the child\'s source and skips the child while the plot is null', async () => {
    const seen: (number | undefined)[] = [];
    const child: IndicatorInstance = { seed: () => Promise.resolve([]), close: () => undefined,
      update: b => { seen.push((b as Bar & { external?: number }).external); return Promise.resolve({ p: 1 }); } };
    const sourced = new SourcedInstance(child, recorder('parent', [], b => (b.time < 2 ? null : b.time * 10)), 'p');
    const rows = await sourced.seed([bar(1), bar(2), bar(3)]);
    expect(rows.map(r => r.p ?? null)).toEqual([null, 1, 1]);
    expect(seen).toEqual([20, 30]);
  });

  it('adds a bar to the child, not a replace, when the parent plot first gets a value on the forming bar', async () => {
    const replaces: boolean[] = [];
    const child: IndicatorInstance = { seed: () => Promise.resolve([]), close: () => undefined, update: (_b, replace) => { replaces.push(replace); return Promise.resolve({ p: 1 }); } };
    let ready = false;
    const parent = recorder('parent', [], () => (ready ? 5 : null));
    const sourced = new SourcedInstance(child, parent, 'p');
    await sourced.update(bar(1), false);
    ready = true;
    await sourced.update(bar(1), true);
    await sourced.update(bar(1), true);
    expect(replaces).toEqual([false, true]);
  });
});
