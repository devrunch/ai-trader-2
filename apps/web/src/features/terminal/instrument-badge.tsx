import { ChevronDown } from 'lucide-react';
import { ApiError } from '../../shared/api/api-error';
import { statusText } from '../../shared/live';
import { Button } from '../../shared/ui/button';
import { Skeleton } from '../../shared/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../shared/ui/tooltip';
import { formatChange, formatPrice } from './format';
import { useLivePrice } from './use-quote';

/** Symbol (opens search), last price, change and a status dot whose words are in the tooltip (FR-UI-1, FR-UI-7). */
export function InstrumentBadge({ symbol, onSymbolClick }: { symbol: string; onSymbolClick?: () => void }) {
  const { quote, last, change, pct } = useLivePrice(symbol);
  const status = statusText(quote.data?.status);
  const [exchange, ticker] = symbol.includes(':') ? symbol.split(':') : ['', symbol];
  const dot = quote.data?.status.state === 'stale' ? 'bg-down' : status ? 'bg-warning' : 'bg-up';
  return <div className="flex min-w-0 items-center gap-2">
    <button type="button" aria-label={symbol} onClick={onSymbolClick}
      className="flex h-7 items-center gap-1 rounded px-2 hover:bg-muted">
      <span className="text-[13px] font-semibold">{ticker}</span>
      {exchange && <span className="text-[11px] text-muted-foreground">{exchange}</span>}
      <ChevronDown className="size-3.5 text-muted-foreground" />
    </button>
    {quote.isPending && <Skeleton role="status" aria-label="Loading quote" className="h-4 w-28" />}
    {quote.isError && <span role="alert" className="flex items-center gap-2 text-[12px] text-down">
      {quote.error instanceof ApiError ? quote.error.message : 'Unable to load quote'}
      <Button size="xs" variant="outline" onClick={() => { void quote.refetch(); }}>Retry</Button>
    </span>}
    {last !== undefined && <span className="num text-[15px] font-semibold">{formatPrice(last)}</span>}
    {change !== undefined && pct !== undefined && <span data-tone={change >= 0 ? 'up' : 'down'}
      className={`num text-[12px] ${change >= 0 ? 'text-up' : 'text-down'}`}>{formatChange(change, pct)}</span>}
    {quote.data && <Tooltip><TooltipTrigger asChild>
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground" tabIndex={0}>
        <span aria-hidden className={`size-2 rounded-full ${dot}`} />{status && <span className="hidden max-w-36 truncate lg:inline">{status}</span>}
      </span>
    </TooltipTrigger><TooltipContent>{status ?? 'Live data'}</TooltipContent></Tooltip>}
  </div>;
}
