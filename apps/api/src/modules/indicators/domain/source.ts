import type { Bar, PriceSource } from '@aitrader/contracts';

export function priceOf(bar: Bar, source: PriceSource): number {
  switch (source) {
    case 'open': return bar.open;
    case 'high': return bar.high;
    case 'low': return bar.low;
    case 'close': return bar.close;
    case 'hl2': return (bar.high + bar.low) / 2;
    case 'hlc3': return (bar.high + bar.low + bar.close) / 3;
    case 'ohlc4': return (bar.open + bar.high + bar.low + bar.close) / 4;
    case 'hlcc4': return (bar.high + bar.low + bar.close + bar.close) / 4;
  }
}
