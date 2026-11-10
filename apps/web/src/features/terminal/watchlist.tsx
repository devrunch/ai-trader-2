import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { InstrumentSearchResponseSchema, type QuoteResponse } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';
import { liveClient } from '../../shared/live';
import { Skeleton } from '../../shared/ui/skeleton';
import { formatPct, formatPrice } from './format';
import { useLiveChange, useQuotes } from './use-quote';

const quiet = { onReset: () => undefined, onUpdate: () => undefined, onStatus: () => undefined };

/** Popular instruments with live prices (FR-UI-1); prices update through LiveStore, not React state. */
export function Watchlist() {
  const popular = useQuery({ queryKey: ['instruments', 'popular'], staleTime: 300_000,
    queryFn: ({ signal }) => apiFetch('v1/instruments/search?q=', { schema: InstrumentSearchResponseSchema, signal }) });
  if (popular.isPending) return <div role="status" aria-label="Loading watchlist" className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-8" />)}</div>;
  if (popular.isError) {
    return <p role="alert" className="text-sm text-down">Watchlist unavailable.{' '}
      <button type="button" className="underline" onClick={() => { void popular.refetch(); }}>Retry</button></p>;
  }
  if (popular.data.results.length === 0) return <p className="p-3 text-muted-foreground">No symbols yet.</p>;
  return <div className="text-[12px]">
    <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 border-b bg-panel px-3 py-1.5 text-[11px] text-muted-foreground">
      <span>Symbol</span><span className="w-20 text-right">Last</span><span className="w-16 text-right">Chg%</span>
    </div>
    <Rows items={popular.data.results} />
  </div>;
}

function Rows({ items }: { items: Array<{ id: string; description: string }> }) {
  const quotes = useQuotes(items.map(item => item.id));
  return <ul>{items.map(item => <WatchRow key={item.id} symbol={item.id} name={item.description} quote={quotes.data?.get(item.id)} />)}</ul>;
}

function WatchRow({ symbol, name, quote }: { symbol: string; name: string; quote: QuoteResponse | undefined }) {
  const navigate = useNavigate();
  const { symbol: current, interval } = useSearch({ from: '/terminal' });
  const { last, change, pct } = useLiveChange(symbol, quote);
  useEffect(() => liveClient().subscribe(symbol, '1', quiet), [symbol]);
  const tone = change === undefined ? 'text-muted-foreground' : change >= 0 ? 'text-up' : 'text-down';
  const ticker = symbol.includes(':') ? symbol.slice(symbol.indexOf(':') + 1) : symbol;
  return <li>
    <button type="button" title={`${symbol} · ${name}`} aria-label={`${symbol} ${name}`} aria-current={symbol === current ? 'true' : undefined}
      className={`grid h-7 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 px-3 text-left hover:bg-muted ${symbol === current ? 'bg-muted' : ''}`}
      onClick={() => { void navigate({ to: '/terminal', search: { symbol, interval } }); }}>
      <span className="truncate font-semibold">{ticker}</span>
      <span className="num w-20 text-right">{last === undefined ? '—' : formatPrice(last)}</span>
      <span className={`num w-16 text-right ${tone}`}>{pct === undefined ? '' : formatPct(pct)}</span>
    </button>
  </li>;
}
