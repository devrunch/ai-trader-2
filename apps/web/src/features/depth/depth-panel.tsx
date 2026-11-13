import type { Depth, DepthLevel } from '@aitrader/contracts';
import { Skeleton } from '../../shared/ui/skeleton';
import { formatPrice } from '../terminal';
import { STALE_MS, useDepth, useNow } from './use-depth';

const REASONS: Record<string, string> = { 'Not subscribed yet': 'Waiting for depth', 'Feed down': 'Order book feed is down' };

function Row({ level, max, side, showQty }: { level: DepthLevel; max: number; side: 'bid' | 'ask'; showQty: boolean }) {
  const width = max > 0 ? Math.round((level.quantity / max) * 100) : 0;
  return <li data-side={side} className="relative grid grid-cols-3 px-2 py-0.5 text-[12px] tabular-nums">
    {showQty && <span aria-hidden data-testid="depth-bar" style={{ width: `${String(width)}%` }}
      className={`absolute inset-y-0 right-0 opacity-20 ${side === 'bid' ? 'bg-up' : 'bg-down'}`} />}
    <span className={`relative ${side === 'bid' ? 'text-up' : 'text-down'}`}>{formatPrice(level.price)}</span>
    <span className="relative text-right">{showQty ? level.quantity.toLocaleString('en-IN') : '–'}</span>
    <span className="relative text-right text-muted-foreground">{level.orders ?? '–'}</span>
  </li>;
}

function Imbalance({ depth }: { depth: Depth }) {
  if (depth.imbalance === null) return <p className="px-2 py-1 text-[11px] text-muted-foreground">Imbalance unavailable (no quantities)</p>;
  const buyPct = Math.round(((depth.imbalance + 1) / 2) * 100);
  const lean = depth.imbalance > 0 ? 'buyers' : depth.imbalance < 0 ? 'sellers' : 'balanced';
  return <div className="px-2 py-1 text-[11px]">
    <div className="flex justify-between text-muted-foreground">
      <span>Buy {depth.totalBidQty.toLocaleString('en-IN')}</span><span>Sell {depth.totalAskQty.toLocaleString('en-IN')}</span>
    </div>
    <div role="img" aria-label={`Imbalance ${depth.imbalance.toFixed(2)}, ${lean} lead`} className="my-1 flex h-1.5 overflow-hidden rounded bg-down">
      <div className="bg-up" style={{ width: `${String(buyPct)}%` }} />
    </div>
    <p className="text-center text-muted-foreground">Imbalance {depth.imbalance > 0 ? '+' : ''}{depth.imbalance.toFixed(2)} ({lean})</p>
  </div>;
}

function Book({ depth, now }: { depth: Depth; now: number }) {
  const showQty = depth.levels === '5';
  const max = Math.max(0, ...depth.bids.map(l => l.quantity), ...depth.asks.map(l => l.quantity));
  const stale = now - depth.at > STALE_MS;
  return <div>
    <div className="grid grid-cols-3 px-2 py-1 text-[11px] text-muted-foreground"><span>Price</span><span className="text-right">Qty</span><span className="text-right">Orders</span></div>
    <ul aria-label="Asks">{[...depth.asks].reverse().map(l => <Row key={l.price} level={l} max={max} side="ask" showQty={showQty} />)}</ul>
    <p className="border-y px-2 py-1 text-center text-[12px]">
      Spread {depth.spread === null ? '–' : formatPrice(depth.spread)}{depth.spreadPct === null ? '' : ` (${depth.spreadPct.toFixed(3)}%)`}
    </p>
    <ul aria-label="Bids">{depth.bids.map(l => <Row key={l.price} level={l} max={max} side="bid" showQty={showQty} />)}</ul>
    <Imbalance depth={depth} />
    {stale && <p role="status" className="px-2 py-1 text-center text-[11px] text-warning">Stale: last update {Math.round((now - depth.at) / 1000)} s ago</p>}
  </div>;
}

/** The order book for a symbol: 5 levels each side on NSE/BSE, best bid and ask on Deriv, and why when there is none. */
export function DepthPanel({ symbol }: { symbol: string }) {
  const { data, isPending, isError, refetch } = useDepth(symbol);
  const now = useNow();
  if (isPending) return <div aria-label="Loading order book" className="space-y-1 p-2"><Skeleton className="h-4" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
  if (isError) return <p className="p-3 text-[12px] text-muted-foreground">Could not load the order book. <button type="button" className="text-link underline" onClick={() => { void refetch(); }}>Retry</button></p>;
  if (!data.depth) return <p className="p-3 text-[12px] text-muted-foreground">{REASONS[data.unavailable ?? ''] ?? data.unavailable ?? 'Waiting for depth'}</p>;
  return <Book depth={data.depth} now={now} />;
}
