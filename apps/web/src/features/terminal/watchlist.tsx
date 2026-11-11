import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { QuoteResponse } from '@aitrader/contracts';
import { ApiError } from '../../shared/api/api-error';
import { liveClient } from '../../shared/live';
import { Skeleton } from '../../shared/ui/skeleton';
import { formatPct, formatPrice } from './format';
import { useLiveChange, useQuotes } from './use-quote';
import { useWatchlist, useWatchlistEdit } from './use-watchlist';

const quiet = { onReset: () => undefined, onUpdate: () => undefined, onStatus: () => undefined };

/** The user's watchlist with live prices (FR-UI-1): add, remove, drag to reorder. Prices update through LiveStore, not React state. */
export function Watchlist({ onAdd }: { onAdd: () => void }) {
  const list = useWatchlist();
  const { remove, reorder, add } = useWatchlistEdit();
  const failed = [add, remove, reorder].find(m => m.isError)?.error;
  if (list.isPending) return <div role="status" aria-label="Loading watchlist" className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-8" />)}</div>;
  if (list.isError) {
    return <p role="alert" className="text-sm text-down">Watchlist unavailable.{' '}
      <button type="button" className="underline" onClick={() => { void list.refetch(); }}>Retry</button></p>;
  }
  const items = list.data.items;
  return <div className="text-[12px]">
    <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto_auto_1rem] items-center gap-x-3 border-b bg-panel px-3 py-1.5 text-[11px] text-muted-foreground">
      <span>Symbol</span><span className="w-20 text-right">Last</span><span className="w-16 text-right">Chg%</span>
      <button type="button" aria-label="Add symbol" title="Add symbol" className="text-sm leading-none hover:text-foreground" onClick={onAdd}>+</button>
    </div>
    {failed !== undefined && <p role="alert" className="px-3 py-1 text-down">{failed instanceof ApiError ? failed.message : 'Watchlist not saved'}</p>}
    {items.length === 0 ? <p className="p-3 text-muted-foreground">Empty. Use + to add symbols.</p>
      : <Rows items={items} onRemove={s => { remove.mutate(s); }} onMove={order => { reorder.mutate(order); }} />}
  </div>;
}

function Rows({ items, onRemove, onMove }: { items: string[]; onRemove: (symbol: string) => void; onMove: (order: string[]) => void }) {
  const quotes = useQuotes(items);
  const [dragged, setDragged] = useState<string | null>(null);
  const drop = (target: string) => {
    if (dragged === null || dragged === target) return;
    const order = items.filter(s => s !== dragged);
    order.splice(order.indexOf(target), 0, dragged);
    onMove(order);
  };
  return <ul>{items.map(symbol => <WatchRow key={symbol} symbol={symbol} quote={quotes.data?.get(symbol)} onRemove={() => { onRemove(symbol); }}
    drag={{ start: () => { setDragged(symbol); }, end: () => { setDragged(null); }, drop: () => { drop(symbol); } }} />)}</ul>;
}

function WatchRow({ symbol, quote, onRemove, drag }: { symbol: string; quote: QuoteResponse | undefined; onRemove: () => void;
  drag: { start: () => void; end: () => void; drop: () => void } }) {
  const navigate = useNavigate();
  const { symbol: current, interval } = useSearch({ from: '/terminal' });
  const { last, change, pct } = useLiveChange(symbol, quote);
  useEffect(() => liveClient().subscribe(symbol, '1', quiet), [symbol]);
  const tone = change === undefined ? 'text-muted-foreground' : change >= 0 ? 'text-up' : 'text-down';
  const split = symbol.indexOf(':');
  const ticker = split >= 0 ? symbol.slice(split + 1) : symbol;
  return <li draggable className={`group grid grid-cols-[minmax(0,1fr)_1rem] items-center hover:bg-muted ${symbol === current ? 'bg-muted' : ''}`}
    onDragStart={drag.start} onDragEnd={drag.end} onDragOver={e => { e.preventDefault(); }} onDrop={e => { e.preventDefault(); drag.drop(); }}>
    <button type="button" title={symbol} aria-label={symbol} aria-current={symbol === current ? 'true' : undefined}
      className="grid h-7 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 pl-3 text-left"
      onClick={() => { void navigate({ to: '/terminal', search: { symbol, interval } }); }}>
      <span className="truncate"><span className="font-semibold">{ticker}</span> <span className="text-[10px] text-muted-foreground">{split > 0 ? symbol.slice(0, split) : ''}</span></span>
      <span className="num w-20 text-right">{last === undefined ? '—' : formatPrice(last)}</span>
      <span className={`num w-16 text-right ${tone}`}>{pct === undefined ? '' : formatPct(pct)}</span>
    </button>
    <button type="button" aria-label={`Remove ${symbol}`} title="Remove" className="mr-2 text-muted-foreground opacity-0 hover:text-down focus:opacity-100 group-hover:opacity-100"
      onClick={onRemove}>×</button>
  </li>;
}
