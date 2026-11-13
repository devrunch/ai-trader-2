export interface Bar { time: number; open: number; high: number; low: number; close: number; volume: number | null }
export type Series = Array<number | null>;

/** Window over the PRIOR `n` bars (the current bar is excluded), null until the window is full. */
function priorWindow(n: number, pick: (b: Bar) => number | null, reduce: (values: number[]) => number): (bars: Bar[]) => Series {
  return bars => bars.map((_, i) => {
    if (i < n) return null;
    const values: number[] = [];
    for (let j = i - n; j < i; j++) {
      const v = pick(bars[j] as Bar);
      if (v === null) return null;
      values.push(v);
    }
    return reduce(values);
  });
}
const max = (v: number[]): number => v.reduce((a, b) => Math.max(a, b), -Infinity);
const min = (v: number[]): number => v.reduce((a, b) => Math.min(a, b), Infinity);
const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const rangeOf = (b: Bar): number => b.high - b.low;

const avgVolume20 = priorWindow(20, b => b.volume, mean);
const prevClose = (bars: Bar[]): Series => bars.map((_, i) => i === 0 ? null : (bars[i - 1] as Bar).close);

/** Narrowest range check input: the smallest high-low range over the last 7 bars including the current one. */
const lowestRange7 = (bars: Bar[]): Series => bars.map((_, i) => i < 6 ? null : min(bars.slice(i - 6, i + 1).map(rangeOf)));

type Builder = { description: string; build: (bars: Bar[]) => Series };
/** Series a screen can name besides the bar fields (open, high, low, close, volume) and its own indicators. */
export const DERIVED_SERIES: Readonly<Record<string, Builder>> = {
  prevClose: { description: 'Previous bar close', build: prevClose },
  changePct: { description: 'Close vs previous close, percent', build: bars => prevClose(bars).map((p, i) => p === null || p === 0 ? null : ((bars[i] as Bar).close - p) / p * 100) },
  gapPct: { description: 'Open vs previous close, percent', build: bars => prevClose(bars).map((p, i) => p === null || p === 0 ? null : ((bars[i] as Bar).open - p) / p * 100) },
  range: { description: 'High minus low of the bar', build: bars => bars.map(rangeOf) },
  lowestRange7: { description: 'Smallest high-low range of the last 7 bars including this one', build: lowestRange7 },
  highestHigh20: { description: 'Highest high of the prior 20 bars (excludes this bar)', build: priorWindow(20, b => b.high, max) },
  lowestLow20: { description: 'Lowest low of the prior 20 bars (excludes this bar)', build: priorWindow(20, b => b.low, min) },
  highestHigh252: { description: 'Highest high of the prior 252 bars (about a year on 1D)', build: priorWindow(252, b => b.high, max) },
  lowestLow252: { description: 'Lowest low of the prior 252 bars (about a year on 1D)', build: priorWindow(252, b => b.low, min) },
  avgVolume20: { description: 'Average volume of the prior 20 bars', build: avgVolume20 },
  volumeRatio: { description: 'Volume divided by avgVolume20', build: bars => avgVolume20(bars).map((a, i) => { const v = (bars[i] as Bar).volume; return a === null || a === 0 || v === null ? null : v / a; }) },
};
export const BAR_FIELDS = ['open', 'high', 'low', 'close', 'volume'] as const;

/** Bar fields plus the requested derived series (all of them when `only` is not given). Computed only for what a screen reads. */
export function derivedSeries(bars: Bar[], only?: Iterable<string>): Record<string, Series> {
  const out: Record<string, Series> = {
    open: bars.map(b => b.open), high: bars.map(b => b.high), low: bars.map(b => b.low), close: bars.map(b => b.close), volume: bars.map(b => b.volume),
  };
  for (const name of only ?? Object.keys(DERIVED_SERIES)) {
    const builder = DERIVED_SERIES[name];
    if (builder) out[name] = builder.build(bars);
  }
  return out;
}
