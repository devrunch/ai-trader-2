import { useQuery } from '@tanstack/react-query';
import { BriefcaseIcon } from '@phosphor-icons/react';
import { AgentTradesResponseSchema, PaperAccountsResponseSchema, PaperFillsResponseSchema, PaperOrdersResponseSchema, PaperPositionsResponseSchema } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { Page, PageHeader, Panel } from '../../shared/ui/page';
import { Skeleton } from '../../shared/ui/skeleton';
import { positionOwner, splitResults, type Side } from './portfolio-model';

const when = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const money = (n: number, currency: string) => n.toLocaleString('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 });
const tone = (n: number | null | undefined) => (n === null || n === undefined || n === 0 ? '' : n > 0 ? 'text-up' : 'text-down');
const ticker = (s: string) => s.split(':')[1] ?? s;
const OWNER = { ai: 'Assistant', you: 'You', both: 'Both' } as const;

function Score({ title, side, currency, ai = false }: { title: string; side: Side; currency: string; ai?: boolean }) {
  const rate = side.closedTrades ? Math.round((side.wins / side.closedTrades) * 100) : null;
  return <div className={`p-4 ${ai ? 'ai-border' : 'border bg-panel'}`}>
    <p className="text-sm text-muted-foreground">{title}</p>
    <p className={`num mt-1 text-2xl font-semibold ${tone(side.realised)}`}>{money(side.realised, currency)}</p>
    <p className="mt-1 text-sm text-muted-foreground">{side.orders} trades · {side.closedTrades} closed · {rate === null ? 'no closed trades yet' : `${String(rate)}% winners`}</p>
  </div>;
}

/** The paper account, split by who acted: what the assistant did and why, next to what the user did. */
export function PortfolioPage() {
  const accounts = useQuery({ queryKey: ['paper', 'accounts'], queryFn: ({ signal }) => apiFetch('v1/paper/accounts', { schema: PaperAccountsResponseSchema, signal }) });
  const positions = useQuery({ queryKey: ['paper', 'positions'], queryFn: ({ signal }) => apiFetch('v1/paper/positions', { schema: PaperPositionsResponseSchema, signal }) });
  const orders = useQuery({ queryKey: ['paper', 'orders'], queryFn: ({ signal }) => apiFetch('v1/paper/orders', { schema: PaperOrdersResponseSchema, signal }) });
  const fills = useQuery({ queryKey: ['paper', 'fills'], queryFn: ({ signal }) => apiFetch('v1/paper/fills', { schema: PaperFillsResponseSchema, signal }) });
  const trades = useQuery({ queryKey: ['agent', 'trades'], queryFn: ({ signal }) => apiFetch('/v1/agent/trades', { schema: AgentTradesResponseSchema, signal }) });
  const allOrders = orders.data?.orders ?? [];
  const results = splitResults(allOrders, fills.data?.fills ?? []);
  const inr = accounts.data?.accounts.find(a => a.currency === 'INR') ?? accounts.data?.accounts[0];
  const currency = inr?.currency ?? 'INR';
  const open = (positions.data?.positions ?? []).filter(p => p.quantity !== 0);
  const mine = allOrders.filter(o => !o.clientOrderId.startsWith('agent-') && !o.clientOrderId.startsWith('squareoff#') && o.parentOrderId === null).slice(0, 30);
  const loading = accounts.isPending || orders.isPending || fills.isPending;

  return <Page>
    <PageHeader icon={BriefcaseIcon} title="Portfolio"
      description="Your paper account, split by who acted: what the assistant traded and why, next to what you traded. Paper money only." />
    {loading ? <Skeleton className="h-28" /> : <div className="grid gap-3 md:grid-cols-3">
      <div className="border bg-panel p-4">
        <p className="text-sm text-muted-foreground">Paper account{inr ? ` (${inr.currency})` : ''}</p>
        <p className="num mt-1 text-2xl font-semibold">{inr ? money(inr.cash, inr.currency) : '—'}</p>
        <p className="mt-1 text-sm text-muted-foreground">{inr ? `${money(inr.available, inr.currency)} free · started with ${money(inr.initialCash, inr.currency)}` : ''}</p>
      </div>
      <Score title="Assistant's results (realised)" side={results.ai} currency={currency} ai />
      <Score title="Your results (realised)" side={results.you} currency={currency} />
    </div>}

    <Panel title="Open positions" bodyClassName="p-0">
      {open.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No open positions.</p>
        : <table className="w-full text-sm"><thead className="text-left text-muted-foreground"><tr className="border-b">
          <th className="px-4 py-2 font-medium">Symbol</th><th className="px-2 py-2 font-medium">Held by</th><th className="px-2 py-2 text-right font-medium">Qty</th>
          <th className="px-2 py-2 text-right font-medium">Avg</th><th className="px-2 py-2 text-right font-medium">Last</th><th className="px-4 py-2 text-right font-medium">P&amp;L</th></tr></thead>
          <tbody className="num">{open.map(p => { const who = positionOwner(p, allOrders); return <tr key={`${p.instrumentId}-${p.product}`} className="border-b last:border-b-0">
            <td className="px-4 py-2 font-semibold">{ticker(p.instrumentId)} <span className="text-xs font-normal text-muted-foreground">{p.product}</span></td>
            <td className={`px-2 py-2 ${who === 'ai' ? 'ai-text' : ''}`}>{OWNER[who]}</td>
            <td className="px-2 py-2 text-right">{p.quantity}</td><td className="px-2 py-2 text-right">{p.averagePrice.toFixed(2)}</td>
            <td className="px-2 py-2 text-right">{p.lastPrice?.toFixed(2) ?? '—'}</td>
            <td className={`px-4 py-2 text-right ${tone(p.unrealisedPnl)}`}>{p.unrealisedPnl === null ? '—' : money(p.unrealisedPnl, p.currency)}</td></tr>; })}</tbody></table>}
    </Panel>

    <div className="grid gap-4 lg:grid-cols-2">
      <Panel ai title="What the assistant did" bodyClassName="p-0">
        {trades.isPending ? <div className="p-4"><Skeleton className="h-16" /></div>
          : (trades.data?.items.length ?? 0) === 0 ? <p className="p-4 text-sm text-muted-foreground">The assistant has not traded yet. Follow an item in What to watch, or ask it for a setup.</p>
          : <ul>{trades.data?.items.map(t => <li key={t.id} className="space-y-1 border-b px-4 py-3 last:border-b-0 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className={`font-semibold ${t.side === 'buy' ? 'text-up' : 'text-down'}`}>{t.skipped ? 'Skipped' : t.side === 'buy' ? 'Bought' : 'Sold'}</span>
              <span className="font-semibold">{t.skipped ? ticker(t.symbol) : `${String(t.quantity)} ${ticker(t.symbol)}`}</span>
              {t.entry !== null && !t.skipped && <span className="num text-muted-foreground">at {t.entry}{t.stopLoss !== null ? `, stop ${String(t.stopLoss)}` : ''}{t.target !== null ? `, target ${String(t.target)}` : ''}</span>}
              <span className="ml-auto text-xs text-muted-foreground">{when.format(Date.parse(t.createdAt))}</span>
            </div>
            <p className="text-muted-foreground">{t.skipped ?? t.rationale}</p>
            <p className="text-xs text-muted-foreground">{t.trigger}{t.skill ? ` · using ${t.skill}` : ''}{t.status ? ` · ${t.status}` : ''}
              {t.pnl !== null && <span className={`num ${tone(t.pnl)}`}> · {money(t.pnl, t.currency)}</span>}</p>
          </li>)}</ul>}
      </Panel>
      <Panel title="What you did" bodyClassName="p-0">
        {orders.isPending ? <div className="p-4"><Skeleton className="h-16" /></div>
          : mine.length === 0 ? <p className="p-4 text-sm text-muted-foreground">You have not placed a paper order yet. Use Buy or Sell in the terminal.</p>
          : <ul>{mine.map(o => <li key={o.id} className="flex flex-wrap items-baseline gap-x-2 border-b px-4 py-2.5 text-sm last:border-b-0">
            <span className={`font-semibold ${o.side === 'buy' ? 'text-up' : 'text-down'}`}>{o.side === 'buy' ? 'Buy' : 'Sell'}</span>
            <span className="font-semibold">{o.quantity} {ticker(o.instrumentId)}</span>
            <span className="num text-muted-foreground">{o.fillPrice !== null ? `at ${String(o.fillPrice)}` : o.limitPrice !== null ? `limit ${String(o.limitPrice)}` : o.type}</span>
            <span className="text-xs text-muted-foreground">{o.status}</span>
            <span className="ml-auto text-xs text-muted-foreground">{when.format(o.placedAt)}</span>
          </li>)}</ul>}
      </Panel>
    </div>
  </Page>;
}
