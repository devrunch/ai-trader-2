export interface OhlcBar { time: number; open: number; high: number; low: number; close: number }
interface Segment { from: { time: number; price: number }; to: { time: number; price: number }; label: string }
export interface Geometry { segments: Segment[]; note: string | null }

const fmt = (price: number): string => price.toFixed(2);

/** Indices of swing highs and lows: a bar beats the k bars on each side (ties to the left do not count as beaten). */
export function pivots(bars: readonly OhlcBar[], k: number): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = k; i < bars.length - k; i++) {
    const bar = bars[i];
    if (!bar) continue;
    let high = true;
    let low = true;
    for (let j = i - k; j <= i + k && (high || low); j++) {
      const other = bars[j];
      if (j === i || !other) continue;
      if (j < i ? other.high >= bar.high : other.high > bar.high) high = false;
      if (j < i ? other.low <= bar.low : other.low < bar.low) low = false;
    }
    if (high) highs.push(i);
    if (low) lows.push(i);
  }
  return { highs, lows };
}

/** Average true range over the window; the tolerance for "the same level". */
function averageRange(bars: readonly OhlcBar[]): number {
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const prev = bars[i - 1];
    if (!bar) continue;
    sum += prev ? Math.max(bar.high - bar.low, Math.abs(bar.high - prev.close), Math.abs(bar.low - prev.close)) : bar.high - bar.low;
  }
  return bars.length > 0 ? sum / bars.length : 0;
}

/** Support and resistance: swing prices clustered within half an average range; the most-touched clusters win. */
export function levels(bars: readonly OhlcBar[], count: number, k = 3): Geometry {
  const first = bars[0];
  const last = bars.at(-1);
  if (!first || !last) return { segments: [], note: 'No bars to draw on.' };
  const { highs, lows } = pivots(bars, k);
  const prices = [...highs.map(i => bars[i]?.high ?? 0), ...lows.map(i => bars[i]?.low ?? 0)].sort((a, b) => a - b);
  if (prices.length === 0) return { segments: [], note: 'No swing highs or lows in this window; no levels drawn.' };
  const tolerance = averageRange(bars) / 2;
  const clusters: number[][] = [];
  for (const price of prices) {
    const current = clusters.at(-1);
    if (current && price - (current[0] ?? price) <= tolerance) current.push(price);
    else clusters.push([price]);
  }
  const ranked = clusters.map(c => ({ price: c.reduce((a, b) => a + b, 0) / c.length, touches: c.length }))
    .sort((a, b) => b.touches - a.touches || Math.abs(a.price - last.close) - Math.abs(b.price - last.close))
    .slice(0, count).sort((a, b) => b.price - a.price);
  return {
    segments: ranked.map(l => ({ from: { time: first.time, price: l.price }, to: { time: last.time, price: l.price },
      label: `${l.price >= last.close ? 'Resistance' : 'Support'} ${fmt(l.price)} · ${String(l.touches)} touches` })),
    note: null,
  };
}

/** A line through the two most recent swing lows (support) or highs (resistance), extended to the last bar. */
export function trendline(bars: readonly OhlcBar[], side: 'support' | 'resistance', k = 3): Geometry {
  const last = bars.at(-1);
  const { highs, lows } = pivots(bars, k);
  const points = (side === 'support' ? lows : highs).slice(-2);
  const [a, b] = points.map(i => bars[i]);
  if (!last || !a || !b) return { segments: [], note: `Fewer than two swing ${side === 'support' ? 'lows' : 'highs'} in this window; no trend line drawn.` };
  const pa = side === 'support' ? a.low : a.high;
  const pb = side === 'support' ? b.low : b.high;
  const slope = (pb - pa) / (b.time - a.time);
  const end = pa + slope * (last.time - a.time);
  return { segments: [{ from: { time: a.time, price: pa }, to: { time: last.time, price: end },
    label: `${side === 'support' ? 'Support' : 'Resistance'} trend ${fmt(pa)} → ${fmt(end)}` }], note: null };
}

/** The highest high and lowest low between two bar times, inclusive. */
export function range(bars: readonly OhlcBar[], from: number, to: number): Geometry {
  const inside = bars.filter(bar => bar.time >= from && bar.time <= to);
  const first = inside[0];
  const last = inside.at(-1);
  if (!first || !last) return { segments: [], note: 'No bars in that time range.' };
  const high = Math.max(...inside.map(bar => bar.high));
  const low = Math.min(...inside.map(bar => bar.low));
  return { segments: [
    { from: { time: first.time, price: high }, to: { time: last.time, price: high }, label: `High ${fmt(high)}` },
    { from: { time: first.time, price: low }, to: { time: last.time, price: low }, label: `Low ${fmt(low)}` },
  ], note: null };
}
