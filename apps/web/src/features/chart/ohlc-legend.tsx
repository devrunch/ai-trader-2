import type { Bar } from '@aitrader/contracts';

const price = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const volume = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 2 });

/** The hovered bar (or the newest when not hovering): open, high, low, close, change and volume, coloured by direction. */
export function OhlcLegend({ symbol, interval, bar, previousClose }: { symbol: string; interval: string; bar: Bar | undefined; previousClose: number | undefined }) {
  const tone = bar && bar.close >= bar.open ? 'text-up' : 'text-down';
  const change = bar && previousClose !== undefined ? bar.close - previousClose : undefined;
  const pct = change !== undefined && previousClose ? (change / previousClose) * 100 : undefined;
  return <div className="flex flex-wrap items-baseline gap-x-2 text-[12px]" data-testid="ohlc-legend">
    <span className="font-semibold">{symbol}</span><span className="text-muted-foreground">· {interval}</span>
    {bar && <span className="num flex gap-x-2">
      {(['open', 'high', 'low', 'close'] as const).map(key => <span key={key}><span className="text-muted-foreground">{key[0]?.toUpperCase()}</span>{' '}
        <span className={tone}>{price.format(bar[key])}</span></span>)}
      {change !== undefined && pct !== undefined && <span className={change >= 0 ? 'text-up' : 'text-down'}>
        {change >= 0 ? '+' : '−'}{price.format(Math.abs(change))} ({change >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(2)}%)</span>}
      {bar.volume !== null && <span><span className="text-muted-foreground">Vol</span> {volume.format(bar.volume)}</span>}
    </span>}
  </div>;
}
