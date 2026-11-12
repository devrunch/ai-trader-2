import { useQuery } from '@tanstack/react-query';
import { AgentTradesResponseSchema, type AgentTradeDto } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';
import { formatMoney, formatPnl } from './paper-format';

const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const tone = (value: number | null): string => (value === null || value === 0 ? 'text-muted-foreground' : value > 0 ? 'text-up' : 'text-down');
const price = (value: number | null, currency: string): string => (value === null ? '—' : formatMoney(value, currency));

/** The assistant's own trades, newest first (the server orders them). */
export function useAgentTrades(enabled: boolean) {
  return useQuery({ queryKey: ['agent', 'trades'], enabled, refetchInterval: 30_000,
    queryFn: ({ signal }) => apiFetch('v1/agent/trades?limit=50', { schema: AgentTradesResponseSchema, signal }) });
}

export function TradeJournal({ rows }: { rows: AgentTradeDto[] }) {
  return <ul aria-label="Assistant trades" className="divide-y">
    {rows.map(t => <li key={t.id} className="space-y-0.5 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-semibold">{t.symbol}</span>
        <span className={t.side === 'buy' ? 'text-up' : 'text-down'}>{t.side === 'buy' ? 'Buy' : 'Sell'} {t.quantity}</span>
        <span className="num text-muted-foreground">entry {price(t.entry, t.currency)} · stop {price(t.stopLoss, t.currency)} · target {price(t.target, t.currency)}</span>
        <span className="num text-muted-foreground">risk {price(t.riskAmount, t.currency)}</span>
        {t.pnl !== null && <span className={`num ${tone(t.pnl)}`}>{formatPnl(t.pnl, t.currency)}</span>}
        <span className="text-muted-foreground">{t.status ?? 'pending'}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">PAPER · {time.format(Date.parse(t.createdAt))}</span>
      </div>
      <p className="line-clamp-2">{t.rationale}</p>
      <p className="text-[11px] text-muted-foreground">{t.skill ? `via ${t.skill} · ` : ''}{t.trigger}</p>
    </li>)}
  </ul>;
}
