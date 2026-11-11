import { parentPort } from 'node:worker_threads';
import * as pinets from 'pinets';
import { z } from 'zod';
import { idsFromTitles, pineInputIds, type PineMeta } from '../../domain/pine/pine-definition';
import { HostMessageSchema, type Candle, type PlotRow, type WorkerMessage } from './pine-protocol';

// PineTS's bundled declarations don't resolve under NodeNext; the parts used here are typed from what the worker calls.
interface Provider {
  configure(): void;
  getSymbolInfo(ticker: string): Promise<object>;
  getMarketData(ticker: string, timeframe: string, limit?: number, from?: number, to?: number): Promise<Candle[]>;
}
interface IndicatorLike { getInputsMeta(): unknown }
interface StreamLike { on(event: string, handler: (payload: unknown) => void): void; stop(): void }
interface PineTSLike { run(indicator: IndicatorLike): Promise<unknown>; stream(indicator: IndicatorLike, options: { live: boolean; interval: number; pageSize: number }): StreamLike }
const Module = z.object({
  PineTS: z.custom<new (source: Provider, ticker: string, timeframe: string, limit: number) => PineTSLike>(v => typeof v === 'function'),
  Indicator: z.custom<new (source: string, inputs: Record<string, unknown>) => IndicatorLike>(v => typeof v === 'function'),
});
const { PineTS, Indicator } = Module.parse(pinets);

const InputMetaSchema = z.array(z.object({ type: z.string(), title: z.string().optional(), name: z.string().optional(), defval: z.unknown(),
  tooltip: z.string().optional(), group: z.string().optional(), minval: z.number().optional(), maxval: z.number().optional(), step: z.number().optional(), options: z.array(z.string()).optional() }));
const DescribeContextSchema = z.object({
  indicator: z.object({ title: z.string().optional(), shorttitle: z.string().optional(), overlay: z.boolean().optional() }).optional(),
  plots: z.record(z.string(), z.object({ title: z.string().optional(), options: z.object({ style: z.string().optional() }), data: z.array(z.object({ value: z.unknown() })) })),
});

/** The parts of a streamed context read on every tick; checked shallowly so a tick costs no schema walk over 5,000 points. */
interface PlotPoints { title?: string | undefined; options: { style?: string | undefined }; data: { time: number; value: unknown }[] }
interface StreamContext { plots: Record<string, PlotPoints> }
function isStreamContext(value: unknown): value is StreamContext {
  return typeof value === 'object' && value !== null && 'plots' in value && typeof value.plots === 'object' && value.plots !== null;
}

const port = parentPort;
if (!port) throw new Error('pine-worker must run as a worker thread');
const send = (message: WorkerMessage): void => { port.postMessage(message); };

const SECONDARY_TTL_MS = 5000;
const NON_NUMERIC_STYLES = new Set(['hline', 'shape', 'background', 'char', 'label', 'table', 'linefill']);

const numeric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** Plots that carry numbers, in call order, with the ids the definition gives them. */
function numericPlots(plots: Record<string, PlotPoints>): { key: string; id: string; title: string; style: string | undefined }[] {
  const kept = Object.entries(plots).filter(([key, plot]) => !key.startsWith('__') && !NON_NUMERIC_STYLES.has(plot.options.style ?? '') && !key.startsWith('bgcolor'));
  const titles = kept.map(([key, plot]) => plot.title ?? (key.startsWith('#') ? 'Plot' : key));
  const ids = idsFromTitles(titles, 'plot');
  return kept.map(([key, plot], i) => ({ key, id: ids[i] ?? '', title: titles[i] ?? key, style: plot.options.style }));
}

function symbolInfo(ticker: string, timezone: string, session: string): object {
  const at = ticker.indexOf(':');
  const prefix = at < 0 ? '' : ticker.slice(0, at);
  const bare = at < 0 ? ticker : ticker.slice(at + 1);
  return { ticker: bare, tickerid: ticker, prefix, root: bare, description: bare, type: 'stock', currency: 'INR', basecurrency: '', timezone, session,
    mintick: 0.05, pricescale: 20, minmove: 1, main_tickerid: ticker, current_contract: '', isin: '' };
}

async function describe(source: string): Promise<PineMeta> {
  const indicator = new Indicator(source, {});
  const inputs = InputMetaSchema.parse(indicator.getInputsMeta());
  const candles: Candle[] = Array.from({ length: 3 }, (_, i) => ({ openTime: i * 60_000, closeTime: i * 60_000 + 59_999, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 }));
  const provider: Provider = { configure: () => undefined, getSymbolInfo: ticker => Promise.resolve(symbolInfo(ticker, 'UTC', '24x7')),
    getMarketData: ticker => Promise.resolve(ticker === 'DESCRIBE' ? candles : []) };
  const context = DescribeContextSchema.parse(await new PineTS(provider, 'DESCRIBE', '1', candles.length).run(indicator));
  const entries = Object.entries(context.plots);
  const levels = entries.filter(([, plot]) => plot.options.style === 'hline')
    .flatMap(([key, plot]) => { const value = numeric(plot.data[0]?.value); return value === null ? [] : [{ title: plot.title ?? key, value }]; });
  const plots = numericPlots(Object.fromEntries(entries.map(([key, plot]) => [key, { ...plot, data: [] }])));
  return { title: context.indicator?.title ?? '', shortTitle: context.indicator?.shorttitle ?? '', overlay: context.indicator?.overlay ?? false,
    inputs: inputs.map(input => ({ ...input, title: input.title ?? input.name ?? 'input' })),
    plots: plots.map(plot => ({ key: plot.key, title: plot.title, style: plot.style })), levels };
}

const fetchers = new Map<number, (reply: { candles: Candle[]; reason: string | undefined }) => void>();
let nextFetch = 1;

class Run {
  private candles: Candle[];
  private version = 0;
  private served = 0;
  private wake: (() => void) | null = null;
  private stopped = false;
  private seeded = false;
  private failure: string | null = null;
  private stream: StreamLike | null = null;
  private plots: { key: string; id: string }[] = [];
  private waiting: { ref: number } | null = null;
  private readonly notes = new Set<string>();
  private readonly secondary = new Map<string, { at: number; candles: Candle[] }>();

  constructor(private readonly id: number, private readonly symbol: string, private readonly timeframe: string, private readonly timezone: string,
    private readonly session: string, candles: Candle[]) {
    this.candles = candles;
  }

  start(ref: number, source: string, inputs: Record<string, number | boolean | string>): void {
    const titles = InputMetaSchema.parse(new Indicator(source, {}).getInputsMeta()).map(input => ({ ...input, title: input.title ?? input.name ?? 'input' }));
    const ids = pineInputIds(titles);
    const byTitle = Object.fromEntries(titles.flatMap((input, i) => { const value = inputs[ids[i] ?? '']; return value === undefined ? [] : [[input.title, value]]; }));
    const provider: Provider = { configure: () => undefined, getSymbolInfo: ticker => Promise.resolve(symbolInfo(ticker, this.timezone, this.session)),
      getMarketData: (ticker, timeframe, _limit, from, to) => this.market(ticker, timeframe, from, to) };
    this.waiting = { ref };
    const stream = new PineTS(provider, this.symbol, this.timeframe, this.candles.length)
      .stream(new Indicator(source, byTitle), { live: true, interval: 0, pageSize: Math.max(1, this.candles.length) });
    stream.on('data', payload => { this.onData(payload); });
    stream.on('error', error => { this.fail(error); });
    this.stream = stream;
  }

  tick(ref: number, candle: Candle, replace: boolean): void {
    if (this.failure !== null) { send({ type: 'error', ref, message: this.failure }); return; }
    const last = this.candles.length - 1;
    if (replace && last >= 0) this.candles[last] = candle; else this.candles.push(candle);
    this.waiting = { ref };
    this.version++;
    this.wake?.();
  }

  close(): void {
    this.stopped = true;
    this.stream?.stop();
    this.wake?.();
    this.candles = [];
  }

  private async market(ticker: string, timeframe: string, from: number | undefined, to: number | undefined): Promise<Candle[]> {
    if (ticker !== this.symbol || timeframe !== this.timeframe) return this.other(ticker, timeframe, from, to);
    if (from === undefined) return this.candles.map(c => ({ ...c }));
    // Push provider (FR-IN-29): answers when a tick arrives, so the stream needs no polling.
    while (this.served === this.version && !this.stopped) await new Promise<void>(resolve => { this.wake = resolve; });
    this.served = this.version;
    return this.candles.filter(c => c.openTime >= from).map(c => ({ ...c }));
  }

  private async other(ticker: string, timeframe: string, from: number | undefined, to: number | undefined): Promise<Candle[]> {
    const key = `${ticker}|${timeframe}|${String(from)}|${String(to)}`;
    const cached = this.secondary.get(key);
    if (cached && Date.now() - cached.at < SECONDARY_TTL_MS) return cached.candles;
    const fetch = nextFetch++;
    const reply = await new Promise<{ candles: Candle[]; reason: string | undefined }>(resolve => {
      fetchers.set(fetch, resolve);
      send({ type: 'fetch', fetch, instance: this.id, symbol: ticker, timeframe, ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) });
    });
    if (reply.candles.length === 0) this.notes.add(`${ticker} ${timeframe}: ${reply.reason ?? 'no data'}`);
    this.secondary.set(key, { at: Date.now(), candles: reply.candles });
    return reply.candles;
  }

  private onData(payload: unknown): void {
    const waiting = this.waiting;
    if (!waiting || !isStreamContext(payload)) return;
    this.waiting = null;
    if (this.plots.length === 0) this.plots = numericPlots(payload.plots);
    const reason = this.notes.size > 0 ? [...this.notes].join('; ').slice(0, 300) : undefined;
    const rows = this.seeded ? [this.lastRow(payload.plots)] : this.allRows(payload.plots);
    this.seeded = true;
    send({ type: 'rows', ref: waiting.ref, rows, ...(reason === undefined ? {} : { reason }) });
  }

  private allRows(plots: Record<string, PlotPoints>): PlotRow[] {
    const rows = new Map<number, PlotRow>(this.candles.map(c => [c.openTime, Object.fromEntries(this.plots.map(p => [p.id, null]))]));
    for (const { key, id } of this.plots) for (const point of plots[key]?.data ?? []) { const row = rows.get(point.time); if (row) row[id] = numeric(point.value); }
    return this.candles.map(c => rows.get(c.openTime) ?? {});
  }

  private lastRow(plots: Record<string, PlotPoints>): PlotRow {
    return Object.fromEntries(this.plots.map(({ key, id }) => [id, numeric(plots[key]?.data.at(-1)?.value)]));
  }

  private fail(error: unknown): void {
    const waiting = this.waiting;
    this.waiting = null;
    this.failure = messageOf(error);
    if (waiting) send({ type: 'error', ref: waiting.ref, message: this.failure });
  }
}

const runs = new Map<number, Run>();

port.on('message', (raw: unknown) => {
  const message = HostMessageSchema.parse(raw);
  switch (message.type) {
    case 'describe':
      describe(message.source).then(meta => { send({ type: 'meta', ref: message.ref, meta }); },
        (error: unknown) => { send({ type: 'error', ref: message.ref, message: messageOf(error) }); });
      break;
    case 'open':
      try {
        const run = new Run(message.instance, message.symbol, message.timeframe, message.timezone, message.session, message.candles);
        runs.set(message.instance, run);
        run.start(message.ref, message.source, message.inputs);
      } catch (error) {
        runs.delete(message.instance);
        send({ type: 'error', ref: message.ref, message: messageOf(error) });
      }
      break;
    case 'tick':
      if (runs.has(message.instance)) runs.get(message.instance)?.tick(message.ref, message.candle, message.replace);
      else send({ type: 'error', ref: message.ref, message: 'Pine instance is closed' });
      break;
    case 'close':
      runs.get(message.instance)?.close();
      runs.delete(message.instance);
      break;
    case 'candles':
      fetchers.get(message.fetch)?.({ candles: message.candles, reason: message.reason });
      fetchers.delete(message.fetch);
      break;
  }
});
