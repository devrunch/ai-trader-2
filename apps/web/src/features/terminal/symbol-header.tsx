import { ApiError } from '../../shared/api/api-error';
import { statusText } from '../../shared/live';
import { Button } from '../../shared/ui/button';
import { Skeleton } from '../../shared/ui/skeleton';
import { formatChange, formatPrice } from './format';
import { useLivePrice } from './use-quote';

/** Symbol, last price, change and an honest status badge (FR-UI-1, FR-UI-7). */
export function SymbolHeader({ symbol, onSymbolClick }: { symbol: string; onSymbolClick?: () => void }) {
  const { quote, last, change, pct } = useLivePrice(symbol);
  const status = statusText(quote.data?.status);
  return <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
    <h1 className="text-lg font-semibold"><button type="button" onClick={onSymbolClick}>{symbol}</button></h1>
    {quote.isPending && <Skeleton role="status" aria-label="Loading quote" className="h-5 w-32" />}
    {quote.isError && <span role="alert" className="flex items-center gap-2 text-sm text-down">
      {quote.error instanceof ApiError ? quote.error.message : 'Unable to load quote'}
      <Button size="xs" variant="outline" onClick={() => { void quote.refetch(); }}>Retry</Button>
    </span>}
    {last !== undefined && <span className="font-mono text-lg tabular-nums">{formatPrice(last)}</span>}
    {change !== undefined && pct !== undefined && <span data-tone={change >= 0 ? 'up' : 'down'}
      className={`font-mono text-sm tabular-nums ${change >= 0 ? 'text-up' : 'text-down'}`}>{formatChange(change, pct)}</span>}
    {status && <span className="rounded border border-warning/40 px-1.5 text-xs text-warning">{status}</span>}
  </div>;
}
