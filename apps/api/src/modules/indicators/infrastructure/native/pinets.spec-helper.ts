import * as pinets from 'pinets';
import { z } from 'zod';
import type { Bar } from '@aitrader/contracts';

// PineTS's bundled declarations don't resolve under NodeNext; its two entry points are typed here from what the spec uses.
type Run = (bars: object[], ticker: string, timeframe: string, source: string, inputs: Record<string, unknown>) => Promise<unknown>;
const Module = z.object({ PineTS: z.custom<new (bars: object[], ticker: string, timeframe: string) => { run(indicator: unknown): Promise<unknown> }>(v => typeof v === 'function'),
  Indicator: z.custom<new (source: string, inputs: Record<string, unknown>) => object>(v => typeof v === 'function') });
const { PineTS, Indicator } = Module.parse(pinets);
const run: Run = (bars, ticker, timeframe, source, inputs) => new PineTS(bars, ticker, timeframe).run(new Indicator(source, inputs));
const PlotsSchema = z.object({ plots: z.record(z.string(), z.object({ data: z.array(z.object({ value: z.unknown() })) })) });

/** Runs Pine on PineTS over our bars; returns each plot by title, `null` where Pine has `na`. */
export async function runPine(source: string, inputs: Record<string, unknown>, bars: readonly Bar[], stepMs: number):
  Promise<(title: string) => (number | null)[]> {
  const candles = bars.map(b => ({ openTime: b.time, closeTime: b.time + stepMs - 1, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 }));
  const { plots } = PlotsSchema.parse(await run(candles, 'TEST', String(stepMs / 60_000), source, inputs));
  return title => (plots[title]?.data ?? []).map(point => typeof point.value === 'number' && Number.isFinite(point.value) ? point.value : null);
}
