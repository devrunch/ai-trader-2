import { useState, type ReactNode } from 'react';
import type { PaperFill, PaperOrder, PaperPosition, PaperSide } from '@aitrader/contracts';
import { ApiError } from '../../shared/api/api-error';
import { Button } from '../../shared/ui/button';
import { Dialog } from '../../shared/ui/dialog';
import { Skeleton } from '../../shared/ui/skeleton';
import { OrderTicket } from './order-ticket';
import { formatPnl, formatRupees } from './paper-format';
import { useCancelPaperOrder, useOpenPaperOrders, usePaperAccount, usePaperFills, usePaperPositions } from './use-paper';

type Query<T> = { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
type Tab = 'positions' | 'orders' | 'history';
const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const tone = (value: number | null): string => (value === null || value === 0 ? 'text-muted-foreground' : value > 0 ? 'text-up' : 'text-down');

/** The paper trading panel under the chart: account summary, positions, working orders and history, plus Buy and Sell (FR-PT-1). */
export function TradingPanel({ symbol, onTrade }: { symbol: string; onTrade: (side: PaperSide) => void }) {
  const [tab, setTab] = useState<Tab>('positions');
  const account = usePaperAccount();
  const positions = usePaperPositions();
  const orders = useOpenPaperOrders();
  const fills = usePaperFills(tab === 'history');
  const open = positions.data?.positions.filter(p => p.quantity !== 0) ?? [];
  const unrealised = open.reduce((sum, p) => sum + (p.unrealisedPnl ?? 0), 0);
  const a = account.data?.account;
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'positions', label: `Positions${open.length ? ` ${String(open.length)}` : ''}` },
    { id: 'orders', label: `Orders${orders.data?.orders.length ? ` ${String(orders.data.orders.length)}` : ''}` },
    { id: 'history', label: 'History' },
  ];

  return <div className="flex h-full flex-col text-[13px]">
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b px-3 py-2" aria-label="Paper account">
      {a ? <>
        <Stat label="Available" value={formatRupees(a.available)} />
        <Stat label="Margin used" value={formatRupees(a.usedMargin)} />
        <Stat label="Unrealised P&L" value={formatPnl(unrealised)} className={tone(unrealised)} />
        <Stat label="Realised P&L" value={formatPnl(a.realisedPnl)} className={tone(a.realisedPnl)} />
        <Stat label="Charges" value={formatRupees(a.charges)} />
      </> : account.isError ? <Problem query={account} /> : <Skeleton className="h-8 w-96" />}
      <div className="ml-auto flex gap-1">
        <Button size="sm" className="bg-down text-white hover:bg-down/90" onClick={() => { onTrade('sell'); }}>Sell {short(symbol)}</Button>
        <Button size="sm" className="bg-up text-white hover:bg-up/90" onClick={() => { onTrade('buy'); }}>Buy {short(symbol)}</Button>
      </div>
    </div>
    <div role="tablist" aria-label="Trading" className="flex shrink-0 gap-1 border-b px-2">
      {tabs.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
        className={`h-8 border-b-2 px-2 ${tab === t.id ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        onClick={() => { setTab(t.id); }}>{t.label}</button>)}
    </div>
    <div role="tabpanel" className="min-h-0 flex-1 overflow-auto">
      {tab === 'positions' && <Loaded query={positions} isEmpty={d => d.positions.length === 0} empty="No positions yet. Use Buy or Sell to place a paper order.">
        {d => <PositionsTable rows={d.positions} />}</Loaded>}
      {tab === 'orders' && <Loaded query={orders} isEmpty={d => d.orders.length === 0} empty="No working orders.">
        {d => <OrdersTable rows={d.orders} />}</Loaded>}
      {tab === 'history' && <Loaded query={fills} isEmpty={d => d.fills.length === 0} empty="No trades yet.">
        {d => <FillsTable rows={d.fills} />}</Loaded>}
    </div>
  </div>;
}

/** The order ticket in a dialog, opened from Buy or Sell on the chart or the panel. */
export function OrderDialog({ symbol, side, onClose }: { symbol: string; side: PaperSide; onClose: () => void }) {
  return <Dialog title={`Paper order · ${symbol}`} description="Place a paper order" onClose={onClose}>
    <OrderTicket key={side} symbol={symbol} initialSide={side} />
  </Dialog>;
}

const short = (symbol: string): string => symbol.slice(symbol.indexOf(':') + 1);

function Stat({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return <div className="flex flex-col"><span className="text-[11px] text-muted-foreground">{label}</span><span className={`num font-semibold ${className}`}>{value}</span></div>;
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return <table className="w-full border-collapse text-[13px]">
    <thead className="sticky top-0 bg-panel text-[11px] text-muted-foreground"><tr>
      {head.map((h, i) => <th key={h} scope="col" className={`h-7 px-3 font-normal ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>)}
    </tr></thead>
    <tbody className="[&_td]:h-8 [&_td]:px-3 [&_td]:text-right [&_td:first-child]:text-left [&_tr]:border-t [&_tr:hover]:bg-muted/60">{children}</tbody>
  </table>;
}

function PositionsTable({ rows }: { rows: PaperPosition[] }) {
  return <Table head={['Symbol', 'Product', 'Qty', 'Avg price', 'Last', 'Unrealised P&L', 'Realised P&L']}>
    {rows.map(p => <tr key={`${p.instrumentId}:${p.product}`}>
      <td className="font-semibold">{p.instrumentId}</td><td className="text-muted-foreground">{p.product}</td>
      <td className={`num ${p.quantity > 0 ? 'text-up' : p.quantity < 0 ? 'text-down' : 'text-muted-foreground'}`}>{p.quantity === 0 ? 'closed' : String(p.quantity)}</td>
      <td className="num">{formatRupees(p.averagePrice)}</td>
      <td className="num">{p.lastPrice === null ? '—' : formatRupees(p.lastPrice)}</td>
      <td className={`num ${tone(p.unrealisedPnl)}`}>{p.unrealisedPnl === null ? 'no price' : formatPnl(p.unrealisedPnl)}</td>
      <td className={`num ${tone(p.realisedPnl)}`}>{formatPnl(p.realisedPnl)}</td>
    </tr>)}
  </Table>;
}

function OrdersTable({ rows }: { rows: PaperOrder[] }) {
  const cancel = useCancelPaperOrder();
  return <Table head={['Placed', 'Symbol', 'Side', 'Type', 'Qty', 'Price', 'Status', '']}>
    {rows.map(o => <tr key={o.id}>
      <td className="num text-muted-foreground">{time.format(o.placedAt)}</td><td className="font-semibold">{o.instrumentId}</td>
      <td className={o.side === 'buy' ? 'text-up' : 'text-down'}>{o.side === 'buy' ? 'Buy' : 'Sell'}</td>
      <td>{o.type}</td><td className="num">{o.quantity}</td>
      <td className="num">{o.limitPrice ?? o.triggerPrice ? formatRupees(o.limitPrice ?? o.triggerPrice ?? 0) : 'market'}</td>
      <td className="text-muted-foreground">{o.status}</td>
      <td><Button size="xs" variant="outline" disabled={cancel.isPending} onClick={() => { cancel.mutate(o.id); }}>Cancel</Button></td>
    </tr>)}
  </Table>;
}

function FillsTable({ rows }: { rows: PaperFill[] }) {
  return <Table head={['Time', 'Symbol', 'Side', 'Qty', 'Price', 'Charges', 'Realised P&L']}>
    {rows.map(f => <tr key={f.id}>
      <td className="num text-muted-foreground">{time.format(f.filledAt)}</td><td className="font-semibold">{f.instrumentId}</td>
      <td className={f.side === 'buy' ? 'text-up' : 'text-down'}>{f.side === 'buy' ? 'Buy' : 'Sell'}</td>
      <td className="num">{f.quantity}</td><td className="num">{formatRupees(f.price)}</td>
      <td className="num">{formatRupees(f.charges.total)}</td>
      <td className={`num ${tone(f.realisedPnl)}`}>{formatPnl(f.realisedPnl)}</td>
    </tr>)}
  </Table>;
}

function Problem<T>({ query }: { query: Query<T> }) {
  return <div role="alert" className="flex items-center gap-3"><span className="text-down">{query.error instanceof ApiError ? query.error.message : 'Unable to load'}</span>
    <Button size="xs" variant="outline" onClick={() => { void query.refetch(); }}>Retry</Button></div>;
}

function Loaded<T>({ query, isEmpty, empty, children }: { query: Query<T>; isEmpty: (data: T) => boolean; empty: string; children: (data: T) => ReactNode }) {
  if (query.isPending) return <div role="status" aria-label="Loading" className="space-y-2 p-3"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-1/2" /></div>;
  if (query.isError || query.data === undefined) return <div className="p-3"><Problem query={query} /></div>;
  if (isEmpty(query.data)) return <p className="p-3 text-muted-foreground">{empty}</p>;
  return children(query.data);
}
