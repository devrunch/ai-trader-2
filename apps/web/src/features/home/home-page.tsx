import { useEffect, useState, type ReactNode } from 'react';
import { LineChart } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { AgentTaskSchema, NewsResponseSchema, PaperAccountsResponseSchema, WatchlistSchema } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import { AiButton } from '../../shared/ui/ai-button';
import { Skeleton } from '../../shared/ui/skeleton';
import { CalendarEvents } from '../calendar';
import { marketStatus } from './market-status';
import { WhatToWatchCard } from './what-to-watch';
import { formatPct, formatPrice, useQuotes } from '../terminal';

const ago = (iso: string): string => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return minutes < 60 ? `${String(minutes)}m` : minutes < 1440 ? `${String(Math.round(minutes / 60))}h` : `${String(Math.round(minutes / 1440))}d`;
};

/** The morning view (SRD N1, N2): the brief, the day's releases, the user's markets, headlines, paper account and alerts. */
export function HomePage() {
  const navigate = useNavigate();
  const open = (symbol: string) => { void navigate({ to: '/terminal', search: { symbol, interval: '5' } }); };
  return <div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-7xl min-w-0 space-y-4 px-3 py-5 md:px-6 md:py-7">
    <HomeHeader onOpenTerminal={() => { open('NSE:NIFTY'); }} onOpenAssistant={() => { void navigate({ to: '/terminal', search: { symbol: 'NSE:NIFTY', interval: '5', panel: 'assistant' } }); }} />
    <div className="grid min-w-0 gap-3 lg:grid-cols-12">
      <div className="min-w-0 space-y-3 lg:col-span-8">
        <WhatToWatchCard />
        <Calendar />
        <Headlines />
      </div>
      <div className="min-w-0 space-y-3 lg:col-span-4">
        <Markets onOpen={open} />
        <Paper />
        <Alerts />
      </div>
    </div>
  </div></div>;
}

function StatusPill({ open, label }: { open: boolean; label: string }) {
  return <span className="inline-flex h-7 items-center gap-1.5 border bg-panel px-2.5 text-sm font-medium">
    <span aria-hidden="true" className={`size-2 rounded-full ${open ? 'bg-up' : 'bg-muted-foreground'}`} />{label}</span>;
}

/** Greeting, IST market status and the two quick actions. */
function HomeHeader({ onOpenTerminal, onOpenAssistant }: { onOpenTerminal: () => void; onOpenAssistant: () => void }) {
  const [status, setStatus] = useState(() => marketStatus());
  useEffect(() => { const id = setInterval(() => { setStatus(marketStatus()); }, 30_000); return () => { clearInterval(id); }; }, []);
  return <header className="flex flex-wrap items-end gap-x-6 gap-y-3 pb-1">
    <div className="min-w-0 flex-1 basis-56">
      <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight">{status.greeting}</h1>
      <p className="num text-base text-muted-foreground">{status.clock}</p>
    </div>
    <div role="status" aria-label="Market status" className="flex flex-wrap items-center gap-2">
      <StatusPill open={status.nse.open} label={status.nse.label} /><StatusPill open={status.us.open} label={status.us.label} />
    </div>
    <div className="flex w-full gap-2 sm:w-auto">
      <Button variant="outline" className="h-9 flex-1 rounded-none sm:flex-none" onClick={onOpenTerminal}><LineChart />Open terminal</Button>
      <AiButton className="flex-1 sm:flex-none" onClick={onOpenAssistant}>Ask the assistant</AiButton>
    </div>
  </header>;
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section aria-label={title} className="min-w-0 border bg-panel">
    <header className="flex min-h-11 items-center justify-between gap-2 border-b px-4 py-1.5"><h2 className="text-base font-semibold">{title}</h2>{action}</header>
    <div className="p-4 text-base leading-relaxed">{children}</div>
  </section>;
}

function Calendar() {
  return <Card title="Economic calendar (IST)"><CalendarEvents /></Card>;
}

function Headlines() {
  const news = useQuery({ queryKey: ['news', 'home'], refetchInterval: 300_000,
    queryFn: ({ signal }) => apiFetch('v1/news?hours=24&limit=10', { schema: NewsResponseSchema, signal }) });
  return <Card title="Headlines">
    {news.isPending ? <Skeleton className="h-24" /> : news.isError ? <p role="alert" className="text-down">Headlines could not be loaded. They update every 5 minutes; reload the page to try again.</p>
      : <ul className="divide-y">{news.data.items.map(n => <li key={n.id} className="py-2">
        <a href={n.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{n.title}</a>
        <span className="block text-xs text-muted-foreground">{n.source} · {ago(n.publishedAt)}{n.symbols.length ? ` · ${n.symbols.slice(0, 4).join(', ')}` : ''}</span>
      </li>)}</ul>}
  </Card>;
}

function Markets({ onOpen }: { onOpen: (symbol: string) => void }) {
  const list = useQuery({ queryKey: ['watchlist'], staleTime: 60_000, queryFn: ({ signal }) => apiFetch('v1/watchlist', { schema: WatchlistSchema, signal }) });
  const ids = (list.data?.items ?? []).slice(0, 12);
  const quotes = useQuotes(ids);
  return <Card title="Your markets">
    {list.isPending ? <Skeleton className="h-24" /> : ids.length === 0 ? <p className="text-muted-foreground">Your watchlist is empty.</p>
      : <ul className="divide-y">{ids.map(id => {
        const q = quotes.data?.get(id);
        const tone = q?.changePct == null ? 'text-muted-foreground' : q.changePct >= 0 ? 'text-up' : 'text-down';
        const width = q?.changePct == null ? 0 : Math.min(100, (Math.abs(q.changePct) / 3) * 100);
        return <li key={id}><button type="button" onClick={() => { onOpen(id); }} className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto_4.5rem] items-center gap-x-2 px-1 py-1 text-left hover:bg-muted">
          <span className="truncate font-semibold">{id.slice(id.indexOf(':') + 1)}</span>
          <span className="num">{q ? formatPrice(q.price) : '—'}</span>
          <span className={`num text-right ${tone}`}>{q?.changePct == null ? '' : formatPct(q.changePct)}</span>
          <span aria-hidden="true" className="col-span-3 mt-1 h-0.5 rounded bg-muted"><span className={`block h-full rounded ${q?.changePct != null && q.changePct < 0 ? 'bg-down' : 'bg-up'}`} style={{ width: `${String(width)}%` }} /></span>
        </button></li>;
      })}</ul>}
  </Card>;
}

function Paper() {
  const accounts = useQuery({ queryKey: ['paper', 'accounts'], queryFn: ({ signal }) => apiFetch('v1/paper/accounts', { schema: PaperAccountsResponseSchema, signal }) });
  return <Card title="Paper accounts">
    {accounts.isPending ? <Skeleton className="h-12" /> : accounts.isError ? <p role="alert" className="text-down">Paper accounts could not be loaded. Reload the page; if it stays, open the terminal’s trading panel.</p>
      : <ul className="space-y-1">{accounts.data.accounts.map(a => {
        const money = new Intl.NumberFormat(a.currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: a.currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
        return <li key={a.id} className="flex justify-between gap-2"><span className="font-semibold">{a.currency}</span>
          <span className="num">{money.format(a.available)} free · <span className={a.realisedPnl >= 0 ? 'text-up' : 'text-down'}>{money.format(a.realisedPnl)}</span> realised</span></li>;
      })}</ul>}
  </Card>;
}

function Alerts() {
  const tasks = useQuery({ queryKey: ['agent', 'tasks'], queryFn: ({ signal }) => apiFetch('/v1/agent/tasks', { schema: z.array(AgentTaskSchema), signal }) });
  const active = (tasks.data ?? []).filter(t => t.state === 'active');
  return <Card title="Watching for you">
    {tasks.isPending ? <Skeleton className="h-10" /> : active.length === 0 ? <p className="text-muted-foreground">No alerts or background tasks. Set them from the terminal’s Alerts widget or ask the assistant.</p>
      : <ul className="space-y-1">{active.slice(0, 8).map(t => <li key={t.id} className="flex justify-between gap-2"><span className="truncate">{t.title}</span>
        <span className="shrink-0 text-muted-foreground">{t.mode === 'notify' ? 'alert' : 'assistant'}</span></li>)}</ul>}
  </Card>;
}
