import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { InstrumentSearchResponseSchema } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';
import { liveClient } from '../../shared/live';
import { Skeleton } from '../../shared/ui/skeleton';
import { formatChange, formatPrice } from './format';
import { useLivePrice } from './use-quote';

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
  if (popular.data.results.length === 0) return <p className="text-sm text-muted-foreground">No symbols yet.</p>;
  return <ul className="divide-y text-sm">{popular.data.results.map(item => <WatchRow key={item.id} symbol={item.id} name={item.description} />)}</ul>;
}

function WatchRow({ symbol, name }: { symbol: string; name: string }) {
  const navigate = useNavigate();
  const { interval } = useSearch({ from: '/terminal' });
  const { last, change, pct } = useLivePrice(symbol);
  useEffect(() => liveClient().subscribe(symbol, '1', quiet), [symbol]);
  const tone = change === undefined ? 'text-muted-foreground' : change >= 0 ? 'text-up' : 'text-down';
  return <li>
    <button type="button" className="grid w-full grid-cols-[1fr_auto] gap-x-2 px-1 py-1.5 text-left hover:bg-muted"
      onClick={() => { void navigate({ to: '/terminal', search: { symbol, interval } }); }}>
      <span className="truncate font-medium">{symbol}</span>
      <span className="text-right font-mono tabular-nums">{last === undefined ? '—' : formatPrice(last)}</span>
      <span className="truncate text-xs text-muted-foreground">{name}</span>
      <span className={`text-right font-mono text-xs tabular-nums ${tone}`}>{change !== undefined && pct !== undefined ? formatChange(change, pct) : ''}</span>
    </button>
  </li>;
}
