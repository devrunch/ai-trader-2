import { describe, expect, it, vi } from 'vitest';
import type { Bar, BarsResponse, IndicatorComputeRequest } from '@aitrader/contracts';
import { IndicatorService } from './indicator.service';
import { RuntimeResolver } from './runtime-resolver';
import type { IndicatorInstance, IndicatorProgram, IndicatorRuntime, PlotValues, RuntimeContext } from './ports/indicator-runtime';

const bar = (time: number, close: number): Bar => ({ time, open: close, high: close, low: close, close, volume: 1 });
const history = Array.from({ length: 20 }, (_, i) => bar(i * 60_000, i + 1));

/** Doubles the close into every plot of the program; records how it was called. */
class DoublingRuntime implements IndicatorRuntime {
  readonly name = 'doubling';
  readonly updates: { bar: Bar; replace: boolean }[] = [];
  contexts: RuntimeContext[] = [];
  closed = 0;
  constructor(private readonly kinds: IndicatorProgram['kind'][] = ['builtin']) {}
  supports(program: IndicatorProgram): boolean { return this.kinds.includes(program.kind); }
  create(program: IndicatorProgram, context: RuntimeContext): IndicatorInstance {
    this.contexts.push(context);
    const plots = program.kind === 'builtin' ? program.builtin.definition.plots.map(p => p.id) : ['plot0'];
    const row = (b: Bar): PlotValues => Object.fromEntries(plots.map(id => [id, b.close * 2]));
    return {
      seed: bars => Promise.resolve(bars.map(row)),
      update: (b, replace) => { this.updates.push({ bar: b, replace }); return Promise.resolve(row(b)); },
      close: () => { this.closed++; },
    };
  }
}

function setup(runtimes: IndicatorRuntime[] = [new DoublingRuntime()], page: Partial<BarsResponse> = {}) {
  const bars = vi.fn((symbol: string, interval: BarsResponse['interval'], _cursor: unknown, limit: number) => Promise.resolve<BarsResponse>({
    instrumentId: symbol, resolvedId: 'NSE:RESOLVED', interval, bars: history.slice(-limit), nextBefore: null, status: { state: 'ok' }, ...page,
  }));
  const service = new IndicatorService({ bars }, new RuntimeResolver(runtimes), () => 'Asia/Kolkata');
  return { service, bars };
}
const request = (indicator: IndicatorComputeRequest['indicator'], limit = 5, before?: number): IndicatorComputeRequest =>
  ({ symbol: 'NSE:X', interval: '1', indicator, range: before === undefined ? { limit } : { limit, before } });
const sma = (inputs: Record<string, number | string | boolean> = {}) => ({ kind: 'builtin' as const, id: 'sma', inputs });

describe('IndicatorService.compute (FR-IN-31)', () => {
  it('reads limit plus warm-up bars and returns the newest limit', async () => {
    const runtime = new DoublingRuntime();
    const { service, bars } = setup([runtime]);
    const result = await service.compute(request(sma({ length: 3 })));
    expect(bars).toHaveBeenCalledWith('NSE:X', '1', { latest: true }, 8);
    expect(result).toEqual({ instrumentId: 'NSE:X', resolvedId: 'NSE:RESOLVED', interval: '1', ref: 'builtin:sma@1',
      inputs: { length: 3, source: 'close', offset: 0 }, times: [15, 16, 17, 18, 19].map(i => i * 60_000),
      plots: [{ id: 'ma', values: [32, 34, 36, 38, 40] }], status: { state: 'ok' } });
    expect(runtime.contexts).toEqual([{ instrumentId: 'NSE:RESOLVED', interval: '1', timezone: 'Asia/Kolkata' }]);
    expect(runtime.closed).toBe(1);
  });

  it('pages with before and caps the read at 5,000 bars', async () => {
    const { service, bars } = setup();
    await service.compute(request(sma({ length: 3 }), 10, 99));
    expect(bars).toHaveBeenLastCalledWith('NSE:X', '1', { before: 99 }, 13);
    await service.compute(request({ kind: 'builtin', id: 'ema', inputs: { length: 900 } }, 4990));
    expect(bars).toHaveBeenLastCalledWith('NSE:X', '1', { latest: true }, 5000);
  });

  it('applies the offset input before slicing, reading the bars a positive offset pulls in', async () => {
    const { service, bars } = setup();
    const result = await service.compute(request(sma({ length: 3, offset: 2 }), 3));
    expect(bars).toHaveBeenLastCalledWith('NSE:X', '1', { latest: true }, 8);
    expect(result.plots[0]?.values).toEqual([32, 34, 36]);
  });

  it('passes the bars status through and returns empty series when there are no bars', async () => {
    const { service } = setup(undefined, { bars: [], status: { state: 'stale', reason: 'MARKET_CLOSED' } });
    const result = await service.compute(request(sma()));
    expect(result.times).toEqual([]);
    expect(result.plots).toEqual([{ id: 'ma', values: [] }]);
    expect(result.status).toEqual({ state: 'stale', reason: 'MARKET_CLOSED' });
  });

  it('rejects an unknown built-in with NOT_FOUND', async () => {
    const { service } = setup();
    await expect(service.compute(request({ kind: 'builtin', id: 'zigzag', inputs: {} }))).rejects.toMatchObject({ code: 'NOT_FOUND', details: { ref: 'builtin:zigzag' } });
  });

  it('rejects bad inputs naming the input', async () => {
    const { service } = setup();
    await expect(service.compute(request(sma({ length: 0 })))).rejects.toMatchObject({ code: 'VALIDATION_FAILED', httpStatus: 422, details: { input: 'length' } });
  });

  it('runs Pine through the same call when a runtime supports it, and says UNSUPPORTED otherwise', async () => {
    const pine = { kind: 'pine' as const, source: 'plot(close)', inputs: {} };
    await expect(setup().service.compute(request(pine))).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'UNSUPPORTED' } });
    const result = await setup([new DoublingRuntime(['builtin']), new DoublingRuntime(['pine'])]).service.compute(request(pine, 2));
    expect(result).toMatchObject({ ref: 'pine', plots: [{ id: 'plot0', values: [38, 40] }] });
  });
});

describe('IndicatorService catalog', () => {
  it('lists the wave-1 definitions and finds one by ref', () => {
    const { service } = setup();
    expect(service.list().map(d => d.id).slice(0, 10)).toEqual(['sma', 'ema', 'wma', 'rsi', 'macd', 'bb', 'atr', 'stoch', 'vwap', 'supertrend']);
    expect(service.list()).toHaveLength(29);
    expect(service.get('builtin:rsi@1')).toMatchObject({ id: 'rsi', version: 1 });
    expect(() => service.get('builtin:rsi@9')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('shows a built-in Pine source', () => {
    expect(setup().service.source('builtin:rsi@1')).toContain('ta.rsi(src, len)');
  });
});

describe('IndicatorService.open (FR-IN-5, FR-IN-6)', () => {
  it('adds newer bars, replaces the forming bar and rejects older ones', async () => {
    const runtime = new DoublingRuntime();
    const { service } = setup([runtime]);
    const { result, stream } = await service.open(request(sma({ length: 3 }), 3));
    expect(result.times).toEqual([17, 18, 19].map(i => i * 60_000));
    expect(await stream.push(bar(19 * 60_000, 50))).toEqual({ barTime: 19 * 60_000, values: { ma: 100 } });
    expect(await stream.push(bar(20 * 60_000, 51))).toEqual({ barTime: 20 * 60_000, values: { ma: 102 } });
    expect(runtime.updates.map(u => u.replace)).toEqual([true, false]);
    await expect(stream.push(bar(5, 1))).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { barTime: 5, lastBarTime: 20 * 60_000 } });
    stream.close();
    expect(runtime.closed).toBe(1);
  });

  it('paints offsets on the bars the full run would', async () => {
    const { service } = setup();
    const right = await service.open(request(sma({ length: 3, offset: 1 }), 3));
    expect(await right.stream.push(bar(20 * 60_000, 99))).toEqual({ barTime: 20 * 60_000, values: { ma: 40 } });
    const left = await service.open(request(sma({ length: 3, offset: -1 }), 3));
    expect(await left.stream.push(bar(19 * 60_000, 99))).toEqual({ barTime: 18 * 60_000, values: { ma: 198 } });
  });

  it("shifts each plot by the built-in's own offset (Ichimoku spans), live plots only on the newest bar", async () => {
    const { service, bars } = setup();
    const ichimoku = { kind: 'builtin' as const, id: 'ichimoku', inputs: { conversionPeriods: 2, basePeriods: 3, laggingSpan2Periods: 4, displacement: 3 } };
    const { result, stream } = await service.open(request(ichimoku, 5));
    expect(bars).toHaveBeenCalledWith('NSE:X', '1', { latest: true }, 11);
    const values = (id: string) => result.plots.find(p => p.id === id)?.values;
    expect(values('conversion')).toEqual([32, 34, 36, 38, 40]);
    expect(values('leadA')).toEqual([28, 30, 32, 34, 36]);
    expect(values('leadB')).toEqual([28, 30, 32, 34, 36]);
    expect(values('lagging')).toEqual([36, 38, 40, null, null]);
    expect(await stream.push(bar(20 * 60_000, 21))).toEqual({ barTime: 20 * 60_000, values: { conversion: 42, base: 42, leadA: 38, leadB: 38 } });
  });

  it('applies pushes in order when the caller does not wait', async () => {
    const runtime = new DoublingRuntime();
    const { stream } = (await setup([runtime]).service.open(request(sma(), 3)));
    await Promise.all([stream.push(bar(20 * 60_000, 1)), stream.push(bar(20 * 60_000, 2)), stream.push(bar(21 * 60_000, 3))]);
    expect(runtime.updates.map(u => [u.bar.close, u.replace])).toEqual([[1, false], [2, true], [3, false]]);
  });

  it('starts a stream with no history on the first pushed bar', async () => {
    const { service } = setup(undefined, { bars: [] });
    const { stream } = await service.open(request(sma()));
    expect(await stream.push(bar(1, 4))).toEqual({ barTime: 1, values: { ma: 8 } });
  });
});
