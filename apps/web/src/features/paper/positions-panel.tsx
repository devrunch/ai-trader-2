import type { ReactNode } from 'react';
import type { PaperOrder, PaperPosition } from '@aitrader/contracts';
import { ApiError } from '../../shared/api/api-error';
import { Button } from '../../shared/ui/button';
import { Skeleton } from '../../shared/ui/skeleton';
import { OrderTicket } from './order-ticket';
import { formatPnl, formatRupees } from './paper-format';
import { useCancelPaperOrder, useOpenPaperOrders, usePaperAccount, usePaperPositions } from './use-paper';

type Query<T> = { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };

/** The terminal's Positions tab: paper account, open positions with P&L, working orders, and an order ticket (FR-PT-1). */
export function PositionsPanel({ symbol }: { symbol: string }) {
  const account = usePaperAccount();
  const positions = usePaperPositions();
  const orders = useOpenPaperOrders();
  return <div className="space-y-4 text-sm">
    <section aria-label="Paper account"><h2 className="mb-2 font-medium">Paper account</h2>
      <Loaded query={account}>{({ account: a }) => <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Available</dt><dd className="text-right font-mono tabular-nums">{formatRupees(a.available)}</dd>
        <dt className="text-muted-foreground">Margin used</dt><dd className="text-right font-mono tabular-nums">{formatRupees(a.usedMargin)}</dd>
        <dt className="text-muted-foreground">Realised</dt><dd className={`text-right font-mono tabular-nums ${tone(a.realisedPnl)}`}>{formatPnl(a.realisedPnl)}</dd>
        <dt className="text-muted-foreground">Charges</dt><dd className="text-right font-mono tabular-nums">{formatRupees(a.charges)}</dd>
      </dl>}</Loaded>
    </section>
    <section aria-label="Order ticket"><OrderTicket symbol={symbol} /></section>
    <section aria-label="Positions"><h2 className="mb-2 font-medium">Positions</h2>
      <Loaded query={positions} empty="No positions yet. Place a paper order to start." isEmpty={d => d.positions.length === 0}>
        {d => <ul className="divide-y">{d.positions.map(p => <PositionRow key={`${p.instrumentId}:${p.product}`} position={p} />)}</ul>}
      </Loaded>
    </section>
    <section aria-label="Open orders"><h2 className="mb-2 font-medium">Open orders</h2>
      <Loaded query={orders} empty="No working orders." isEmpty={d => d.orders.length === 0}>
        {d => <ul className="divide-y">{d.orders.map(o => <OrderRow key={o.id} order={o} />)}</ul>}
      </Loaded>
    </section>
  </div>;
}

function PositionRow({ position: p }: { position: PaperPosition }) {
  return <li className="grid grid-cols-[1fr_auto] gap-x-2 py-1.5">
    <span className="truncate font-medium">{p.instrumentId} <span className="text-xs text-muted-foreground">{p.product}</span></span>
    <span className={`text-right font-mono tabular-nums ${p.unrealisedPnl === null ? 'text-muted-foreground' : tone(p.unrealisedPnl)}`}>
      {p.unrealisedPnl === null ? 'no price' : formatPnl(p.unrealisedPnl)}</span>
    <span className="text-xs text-muted-foreground">{p.quantity === 0 ? 'closed' : `${String(p.quantity)} @ ${formatRupees(p.averagePrice)}`}</span>
    <span className={`text-right font-mono text-xs tabular-nums ${tone(p.realisedPnl)}`}>{p.realisedPnl === 0 ? '' : `realised ${formatPnl(p.realisedPnl)}`}</span>
  </li>;
}

function OrderRow({ order }: { order: PaperOrder }) {
  const cancel = useCancelPaperOrder();
  const price = order.limitPrice ?? order.triggerPrice;
  return <li className="flex items-center gap-2 py-1.5">
    <span className="min-w-0 flex-1 truncate">{order.side === 'buy' ? 'Buy' : 'Sell'} {order.quantity} {order.instrumentId}
      <span className="text-xs text-muted-foreground"> {order.type}{price === null ? '' : ` ${formatRupees(price)}`}</span></span>
    <Button size="xs" variant="outline" disabled={cancel.isPending} onClick={() => { cancel.mutate(order.id); }}>Cancel</Button>
  </li>;
}

function tone(value: number): string { return value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-muted-foreground'; }

function Loaded<T>({ query, isEmpty, empty, children }: { query: Query<T>; isEmpty?: (data: T) => boolean; empty?: string; children: (data: T) => ReactNode }) {
  if (query.isPending) return <div role="status" aria-label="Loading" className="space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-1/2" /></div>;
  if (query.isError || query.data === undefined) {
    return <div role="alert" className="flex items-center gap-3"><span className="text-down">{query.error instanceof ApiError ? query.error.message : 'Unable to load'}</span>
      <Button size="xs" variant="outline" onClick={() => { void query.refetch(); }}>Retry</Button></div>;
  }
  if (isEmpty?.(query.data)) return <p className="text-muted-foreground">{empty}</p>;
  return children(query.data);
}
