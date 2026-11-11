import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// FR-IN-29: one test per patch in patches/pinets@0.13.1.patch, against both builds PineTS ships (ESM for specs, CJS for the compiled API).
// PINETS_DIR points a run at an unpatched copy to see these fail.
interface Provider { configure(): void; getSymbolInfo(ticker: string): Promise<object>; getMarketData(ticker: string, timeframe: string, limit?: number, from?: number): Promise<Candle[]> }
interface Candle { openTime: number; closeTime: number; open: number; high: number; low: number; close: number; volume: number }
interface Stream { on(event: string, handler: (payload: unknown) => void): void; stop(): void }
const Module = z.object({ PineTS: z.custom<new (source: Provider, ticker: string, timeframe: string, limit: number) => { stream(source: string, options: object): Stream; run(source: string): Promise<unknown> }>(v => typeof v === 'function') });
const PlotsSchema = z.object({ plots: z.record(z.string(), z.object({ data: z.array(z.object({ time: z.number(), value: z.unknown() })) })) });

const lastValue = (context: z.infer<typeof PlotsSchema>, plot: string): unknown => context.plots[plot]?.data.at(-1)?.value;
const root = process.env.PINETS_DIR;
const builds = {
  cjs: () => Module.parse(createRequire(join(process.cwd(), 'package.json'))(root ?? 'pinets')),
  es: async () => Module.parse(await import(/* @vite-ignore */ root ? join(root, 'dist', 'pinets.min.es.js') : 'pinets')),
};

const STEP = 60_000;
const START = 1_700_000_000_000;
const makeBars = (count: number, offset = 0): Candle[] => Array.from({ length: count }, (_, i) => {
  const open = 100 + offset + (i % 7);
  return { openTime: START + i * STEP, closeTime: START + (i + 1) * STEP - 1, open, high: open + 5, low: open - 5, close: open + (i % 3), volume: 10 };
});

/** A push provider: the stream's refresh call waits until `push` is called, so a tick needs no polling. */
function pushProvider(bars: Candle[], others: Record<string, Candle[]> = {}): { provider: Provider; push(): void; asked: string[] } {
  let waiter: (() => void) | null = null;
  let version = 0;
  let served = 0;
  const asked: string[] = [];
  const provider: Provider = {
    configure: () => undefined,
    getSymbolInfo: ticker => Promise.resolve({ ticker: ticker.split(':').at(-1), tickerid: ticker, prefix: ticker.split(':')[0], currency: 'INR', timezone: 'Asia/Kolkata', mintick: 0.05, type: 'stock', session: '24x7' }),
    async getMarketData(ticker, _timeframe, _limit, from) {
      asked.push(ticker);
      const other = others[ticker];
      if (other) return other;
      if (from !== undefined) {
        while (served === version) await new Promise<void>(resolve => { waiter = resolve; });
        served = version;
      }
      return bars.filter(bar => from === undefined || bar.openTime >= from).map(bar => ({ ...bar }));
    },
  };
  return { provider, asked, push: () => { version++; const wake = waiter; waiter = null; wake?.(); } };
}

const SMA = '//@version=5\nindicator("t")\nplot(ta.sma(close, 3), "sma")';

describe.each(Object.entries(builds))('PineTS patch set (%s build)', (_name, load) => {
  const stops: (() => void)[] = [];
  afterEach(() => { vi.useRealTimers(); for (const stop of stops.splice(0)) stop(); });

  async function open(source: string, bars: Candle[], others: Record<string, Candle[]> = {}) {
    const { PineTS } = await load();
    const feed = pushProvider(bars, others);
    const stream = new PineTS(feed.provider, 'NSE:X', '1', bars.length).stream(source, { live: true, interval: 0, pageSize: bars.length });
    stops.push(() => { stream.stop(); feed.push(); });
    let waiting: ((context: z.infer<typeof PlotsSchema>) => void) | null = null;
    const events: z.infer<typeof PlotsSchema>[] = [];
    stream.on('data', payload => { const context = PlotsSchema.parse(payload); events.push(context); const wake = waiting; waiting = null; wake?.(context); });
    const next = (): Promise<z.infer<typeof PlotsSchema>> => new Promise(resolve => { waiting = resolve; });
    const first = await next();
    /** Changes the bars, wakes the stream and resolves with the context it computes. */
    const tick = async (change: () => void): Promise<z.infer<typeof PlotsSchema>> => { const done = next(); change(); feed.push(); return done; };
    return { first, tick, events, asked: feed.asked };
  }

  it('removes the one-second forming-bar throttle, so every tick is computed at once', async () => {
    const bars = makeBars(30);
    const run = await open(SMA, bars);
    const started = performance.now();
    for (let i = 1; i <= 3; i++) await run.tick(() => { bars[29] = { ...bars[29] as Candle, close: 100 + i }; });
    expect(performance.now() - started).toBeLessThan(700);
  });

  it('runs a push provider with interval 0 without any timer between ticks', async () => {
    const bars = makeBars(30);
    const run = await open(SMA, bars);
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    await run.tick(() => { bars[29] = { ...bars[29] as Candle, close: 140 }; });
    const context = await run.tick(() => { bars[29] = { ...bars[29] as Candle, close: 150 }; });
    expect(lastValue(context, 'sma')).toBeCloseTo(((bars[27]?.close as number) + (bars[28]?.close as number) + 150) / 3, 9);
  });

  it('keeps one point per bar time while ticks replace the forming bar and a new bar is added', async () => {
    const bars = makeBars(30);
    const run = await open(SMA, bars);
    let context = run.first;
    for (let i = 1; i <= 4; i++) context = await run.tick(() => { bars[29] = { ...bars[29] as Candle, close: 100 + i }; });
    const last = bars[29] as Candle;
    context = await run.tick(() => { bars.push({ ...last, openTime: last.openTime + STEP, closeTime: last.closeTime + STEP, close: 111 }); });
    const times = context.plots.sma?.data.map(point => point.time) ?? [];
    expect(times).toEqual(bars.map(bar => bar.openTime));
    expect(lastValue(context, 'sma')).toBeCloseTo(((bars[28]?.close as number) + (bars[29]?.close as number) + 111) / 3, 9);
  });

  it('keeps the exchange prefix, so NSE:X and BSE:X are different data (FR-IN-3)', async () => {
    const bars = makeBars(30);
    const source = '//@version=5\nindicator("t")\nplot(request.security("NSE:Y", "5", close), "nse")\nplot(request.security("BSE:Y", "5", close), "bse")\nplot(syminfo.tickerid == "NSE:X" ? 1 : 0, "id")';
    const run = await open(source, bars, { 'NSE:Y': makeBars(300, 0), 'BSE:Y': makeBars(300, 50) });
    expect(run.asked).toEqual(expect.arrayContaining(['NSE:Y', 'BSE:Y']));
    const nse = lastValue(run.first, 'nse');
    const bse = lastValue(run.first, 'bse');
    expect(nse).toBeTypeOf('number');
    expect((bse as number) - (nse as number)).toBeCloseTo(50, 9);
    expect(lastValue(run.first, 'id')).toBe(1);
  });
});
