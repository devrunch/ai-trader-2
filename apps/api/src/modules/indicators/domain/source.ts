import type { Bar, PriceSource } from '@aitrader/contracts';

/** Marks a `source` input fed by another indicator's plot; the runtime wrapper puts that value on the bar (FR-IN-13). */
export const EXTERNAL_SOURCE = 'external';
export type KernelSource = PriceSource | typeof EXTERNAL_SOURCE;
export type SourcedBar = Bar & { external: number };

export function priceOf(bar: Bar, source: KernelSource): number {
  switch (source) {
    case 'open': return bar.open;
    case 'high': return bar.high;
    case 'low': return bar.low;
    case 'close': return bar.close;
    case 'hl2': return (bar.high + bar.low) / 2;
    case 'hlc3': return (bar.high + bar.low + bar.close) / 3;
    case 'ohlc4': return (bar.open + bar.high + bar.low + bar.close) / 4;
    case 'hlcc4': return (bar.high + bar.low + bar.close + bar.close) / 4;
    case 'external': return 'external' in bar && typeof bar.external === 'number' ? bar.external : Number.NaN;
  }
}
