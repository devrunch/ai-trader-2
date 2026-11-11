import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bar, IndicatorComputeRequest, IndicatorResult } from '@aitrader/contracts';
import { fixtureBars } from '../native/bars.spec-helper';
import { PinePool, PineWorker } from './pine-pool';
import { pineHarness, pineWorkerFile, type PineHarness } from './pine.spec-helper';

const STEP = 15 * 60_000;
const history = fixtureBars(700, 11);
const SMA = '//@version=5\nindicator("SMA")\nlen = input.int(14, "Length", minval=1)\nplot(ta.sma(close, len), "SMA")';
const RSI = '//@version=5\nindicator("RSI")\nlen = input.int(14, "Length", minval=1)\nplot(ta.rsi(close, len), "RSI")';
const request = (indicator: IndicatorComputeRequest['indicator'], limit = 300): IndicatorComputeRequest => ({ symbol: 'NSE:X', interval: '15', indicator, range: { limit } });
const pine = (source: string, inputs: Record<string, number | boolean | string> = {}): IndicatorComputeRequest['indicator'] => ({ kind: 'pine', source, inputs });

let harness: PineHarness | undefined;
afterEach(() => { harness?.pool.close(); harness = undefined; vi.restoreAllMocks(); });
async function setup(other: Record<string, Bar[]> = {}, options: Parameters<typeof pineHarness>[2] = {}): Promise<PineHarness> {
  harness = await pineHarness(history, other, options);
  return harness;
}
const shifted = (delta: number): Bar[] => history.map(bar => ({ ...bar, open: bar.open + delta, high: bar.high + delta, low: bar.low + delta, close: bar.close + delta }));

function expectSame(actual: IndicatorResult, expected: IndicatorResult, tolerance = 1e-9): void {
  expect(actual.times).toEqual(expected.times);
  const a = actual.plots[0]?.values ?? [];
  const b = expected.plots[0]?.values ?? [];
  expect(a).toHaveLength(b.length);
  const bad = a.map((value, i) => ({ i, value, native: b[i] ?? null })).filter(({ value, native }) => (value === null) !== (native === null) || (value !== null && native !== null && Math.abs(value - native) > tolerance * Math.max(1, Math.abs(native))));
  expect(bad.slice(0, 3)).toEqual([]);
}

describe('Pine runtime behind the resolver (FR-IN-31)', () => {
  // FR-IN-2: the same indicator on the same bars gives the same values on either runtime.
  it.each([['sma', SMA], ['rsi', RSI]])('a Pine %s equals the native built-in to 1e-9', async (id, source) => {
    const { service } = await setup();
    const native = await service.compute(request({ kind: 'builtin', id, inputs: { length: 14 } }));
    const scripted = await service.compute(request(pine(source)));
    expectSame(scripted, native);
    expect(scripted.ref).toMatch(/^pine:[0-9a-f]{12}@1$/);
  });

  it('describes a script like a built-in, and its inputs change the values', async () => {
    const { service } = await setup();
    const definition = await service.describe(SMA);
    expect(definition.inputs).toEqual([{ id: 'length', title: 'Length', type: 'int', default: 14, min: 1 }]);
    expect(definition.plots.map(p => p.id)).toEqual(['sma']);
    const short = await service.compute(request(pine(SMA, { length: 3 }), 5));
    const n = history.length;
    const mean = (end: number): number => ((history[end - 2]?.close ?? 0) + (history[end - 1]?.close ?? 0) + (history[end]?.close ?? 0)) / 3;
    expect(short.plots[0]?.values).toHaveLength(5);
    short.plots[0]?.values.forEach((value, i) => { expect(value).toBeCloseTo(mean(n - 5 + i), 8); });
  });

  it('rejects a bad input by name, as a built-in does', async () => {
    const { service } = await setup();
    await expect(service.compute(request(pine(SMA, { length: 0 })))).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { input: 'length' } });
    await expect(service.compute(request(pine(SMA, { nope: 1 })))).rejects.toMatchObject({ details: { input: 'nope' } });
  });

  // FR-IN-6 / FR-IN-30: ticks go to the saved PineTS state and equal a fresh run.
  it('updates from saved state: five ticks on the forming bar, then a new bar, equal a fresh full run', async () => {
    const { service } = await setup();
    const { stream } = await service.open({ ...request(pine(RSI)), range: { limit: 50 } });
    const last = history.at(-1) as Bar;
    let point;
    for (let i = 1; i <= 5; i++) point = await stream.push({ ...last, close: last.close + i });
    const next: Bar = { ...last, time: last.time + STEP, close: last.close + 3 };
    point = await stream.push(next);
    const fresh = await (await pineHarness([...history.slice(0, -1), { ...last, close: last.close + 5 }, next])).service.compute(request(pine(RSI), 1));
    stream.close();
    expect(point?.barTime).toBe(next.time);
    expect(point?.values.rsi).toBeCloseTo(fresh.plots[0]?.values[0] ?? Number.NaN, 9);
  });

  // FR-IN-30: newest tick wins.
  it('computes only the newest of replacement ticks that queue up behind a running one', async () => {
    const { service, pool } = await setup();
    const { stream } = await service.open({ ...request(pine(SMA)), range: { limit: 20 } });
    const last = history.at(-1) as Bar;
    const ticks = vi.spyOn(PineWorker.prototype, 'request');
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => stream.push({ ...last, close: 1000 + i })));
    stream.close();
    const sent = ticks.mock.calls.filter(([message]) => message.type === 'tick').length;
    expect(sent).toBe(1);
    expect(results.at(-1)?.values.sma).toBeCloseTo((history.slice(-14, -1).reduce((sum, bar) => sum + bar.close, 0) + 1019) / 14, 8);
    pool.close();
  });
});

describe('request.security (FR-IN-3, E27)', () => {
  const security = (symbol: string): string => `//@version=5\nindicator("S")\nplot(request.security("${symbol}", "15", close), "other")`;

  it('reads NSE:Y and BSE:Y as different data through the candle source', async () => {
    const { service } = await setup({ 'NSE:Y|15': shifted(1000), 'BSE:Y|15': shifted(2000) });
    const nse = await service.compute(request(pine(security('NSE:Y')), 5));
    const bse = await service.compute(request(pine(security('BSE:Y')), 5));
    const close = history.at(-1)?.close as number;
    expect(nse.plots[0]?.values.at(-1)).toBeCloseTo(close + 1000, 8);
    expect(bse.plots[0]?.values.at(-1)).toBeCloseTo(close + 2000, 8);
    expect(nse.reason).toBeUndefined();
  });

  it('gives na and a reason when the symbol has no data, never the chart bars', async () => {
    const { service } = await setup();
    const result = await service.compute(request(pine(security('NSE:NONE')), 5));
    expect(result.plots[0]?.values).toEqual([null, null, null, null, null]);
    expect(result.reason).toContain('NSE:NONE');
    expect(result.reason).toContain('NO_DATA');
  });

  it('says why a timeframe the store does not have is na', async () => {
    const { service } = await setup({ 'NSE:Y|15': shifted(1) });
    const result = await service.compute(request(pine('//@version=5\nindicator("S")\nplot(request.security("NSE:Y", "120", close), "other")'), 3));
    expect(result.plots[0]?.values).toEqual([null, null, null]);
    expect(result.reason).toContain('120');
  });
});

describe('unsupported features (FR-IN-4)', () => {
  it.each([
    ['//@version=5\nstrategy("s")\nplot(close)', 'strategy()', 2],
    ['//@version=5\nindicator("x")\nx = ta.bogus(close, 3)\nplot(x)', 'ta.bogus', 3],
    ['//@version=4\nstudy("t")\nplot(close)', 'Pine v4', 1],
  ])('fails %j naming the feature and its line, as a 422', async (source, feature, line) => {
    const { service } = await setup();
    await expect(service.compute(request(pine(source)))).rejects.toMatchObject({ code: 'VALIDATION_FAILED', httpStatus: 422, details: { reason: 'UNSUPPORTED', feature, line } });
    await expect(service.describe(source)).rejects.toMatchObject({ details: { reason: 'UNSUPPORTED', feature, line } });
  });

  it('reports the line of a syntax error', async () => {
    const { service } = await setup();
    await expect(service.compute(request(pine('//@version=5\nindicator("x"\nplot(close)')))).rejects.toMatchObject({ details: { reason: 'PINE_ERROR', line: 3 } });
  });
});

describe('worker limits (E26)', () => {
  // Each loop stays under PineTS's own 500,000-iteration guard; together they never finish.
  const LOOP = '//@version=5\nindicator("loop")\ntotal = 0.0\nfor i = 0 to 400000\n    for j = 0 to 400000\n        total += 1\nplot(total)';

  it('kills a script that loops forever, replaces the worker, and native indicators keep updating', async () => {
    const { service, pool } = await setup({}, { timeoutMs: 1500 });
    const native = await service.open(request({ kind: 'builtin', id: 'sma', inputs: {} }));
    const last = history.at(-1) as Bar;
    const before = await native.stream.push({ ...last, close: last.close + 1 });
    const stuck = service.compute(request(pine(LOOP)));
    const during = await native.stream.push({ ...last, close: last.close + 2 });
    await expect(stuck).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'PINE_TIMEOUT' } });
    const after = await native.stream.push({ ...last, close: last.close + 3 });
    expect([before, during, after].map(point => Object.values(point?.values ?? {})[0])).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
    const again = await service.compute(request(pine(SMA), 5));
    expect(again.plots[0]?.values).toHaveLength(5);
    native.stream.close();
    pool.close();
  });

  it('says a lost worker to the live indicator that was on it, then serves new ones from the replacement', async () => {
    const { service, pool } = await setup({}, { timeoutMs: 1500, size: 1 });
    const live = await service.open(request(pine(SMA)));
    await expect(service.compute(request(pine(LOOP)))).rejects.toMatchObject({ details: { reason: 'PINE_TIMEOUT' } });
    await expect(live.stream.push({ ...(history.at(-1) as Bar), close: 1 })).rejects.toMatchObject({ code: 'UNAVAILABLE', details: { reason: 'PINE_CRASHED' } });
    expect((await service.compute(request(pine(SMA), 3))).plots[0]?.values).toHaveLength(3);
    pool.close();
  });

  it('starts no worker until a script runs', async () => {
    const pool = new PinePool({ workerFile: '/does/not/exist.cjs', size: 2, heapMb: 256, timeoutMs: 100 });
    pool.close();
    expect(await pineWorkerFile()).toMatch(/pine-worker/);
  });
});
