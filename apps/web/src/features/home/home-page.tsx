import type { ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { AgentTaskSchema, CalendarResponseSchema, NewsResponseSchema, PaperAccountsResponseSchema, WatchlistSchema, type EconomicEvent } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { ApiError } from '../../shared/api/api-error';
import { Button } from '../../shared/ui/button';
import { Skeleton } from '../../shared/ui/skeleton';
import { ChatMarkdown } from '../chat';
import { formatPct, formatPrice, useQuotes } from '../terminal';

const BriefSchema = z.strictObject({ threadId: z.string(), text: z.string(), error: z.string().nullable() });
const ist = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const ago = (iso: string): string => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return minutes < 60 ? `${String(minutes)}m` : minutes < 1440 ? `${String(Math.round(minutes / 60))}h` : `${String(Math.round(minutes / 1440))}d`;
};
const IMPACT_TONE: Record<EconomicEvent['impact'], string> = { High: 'bg-down', Medium: 'bg-[orange]', Low: 'bg-muted-foreground', Holiday: 'bg-muted-foreground' };

/** The morning view (SRD N1, N2): the brief, the day's releases, the user's markets, headlines, paper account and alerts. */
export function HomePage() {
  const navigate = useNavigate();
  const open = (symbol: string) => { void navigate({ to: '/terminal', search: { symbol, interval: '5' } }); };
  return <div className="mx-auto grid max-w-7xl gap-3 p-3 lg:grid-cols-3">
    <div className="space-y-3 lg:col-span-2">
      <Brief />
      <Calendar />
      <Headlines />
    </div>
    <div className="space-y-3">
      <Markets onOpen={open} />
      <Paper />
      <Alerts />
    </div>
  </div>;
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section aria-label={title} className="rounded border bg-panel">
    <header className="flex items-center justify-between border-b px-3 py-2"><h2 className="text-[13px] font-semibold">{title}</h2>{action}</header>
    <div className="p-3 text-[13px]">{children}</div>
  </section>;
}

function Brief() {
  const brief = useMutation({ retry: 0, mutationFn: () => apiFetch('v1/agent/brief', { method: 'POST', schema: BriefSchema }) });
  return <Card title="Pre-market brief" action={<Button size="xs" disabled={brief.isPending} onClick={() => { brief.mutate(); }}>
    {brief.isPending ? 'Writing…' : brief.data ? 'Refresh' : 'Write today’s brief'}</Button>}>
    {brief.isPending ? <div role="status" aria-label="Writing the brief" className="space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-3/5" /></div>
      : brief.isError ? <p role="alert" className="text-down">{brief.error instanceof ApiError ? brief.error.message : 'The brief failed'}</p>
      : brief.data ? <div className="space-y-2">{brief.data.error && <p role="alert" className="text-down">{brief.data.error}</p>}<ChatMarkdown text={brief.data.text} />
        <p className="text-[11px] text-muted-foreground">Saved as a thread in the assistant; ask follow-ups there.</p></div>
      : <p className="text-muted-foreground">Overnight markets, crude, gold, the dollar, today’s releases and the levels to watch, written by the assistant from live data (about a minute).</p>}
  </Card>;
}

function Calendar() {
  const events = useQuery({ queryKey: ['calendar', 3], refetchInterval: 600_000,
    queryFn: ({ signal }) => apiFetch('v1/calendar?days=3&impact=Medium', { schema: CalendarResponseSchema, signal }) });
  return <Card title="Economic calendar (IST)">
    {events.isPending ? <Skeleton className="h-24" /> : events.isError ? <p role="alert" className="text-down">Calendar unavailable.</p>
      : events.data.events.length === 0 ? <p className="text-muted-foreground">No medium or high impact releases in the next three days.</p>
      : <ul aria-label="Upcoming releases" className="divide-y">{events.data.events.slice(0, 14).map(e => <li key={e.id} className="grid grid-cols-[7.5rem_3rem_minmax(0,1fr)] items-start gap-2 py-1.5">
        <span className="num text-muted-foreground">{ist.format(Date.parse(e.at))}</span>
        <span className="flex items-center gap-1 font-semibold"><span aria-label={`${e.impact} impact`} className={`inline-block size-2 rounded-full ${IMPACT_TONE[e.impact]}`} />{e.country}</span>
        <span className="min-w-0"><span className="font-medium">{e.title}</span>
          {(e.forecast ?? e.previous) && <span className="text-muted-foreground"> · f {e.forecast ?? '—'} · p {e.previous ?? '—'}</span>}
          {e.moves.length > 0 && <span className="block truncate text-[11px] text-muted-foreground">Moves: {e.moves.join(', ')}</span>}</span>
      </li>)}</ul>}
  </Card>;
}

function Headlines() {
  const news = useQuery({ queryKey: ['news', 'home'], refetchInterval: 300_000,
    queryFn: ({ signal }) => apiFetch('v1/news?hours=24&limit=10', { schema: NewsResponseSchema, signal }) });
  return <Card title="Headlines">
    {news.isPending ? <Skeleton className="h-24" /> : news.isError ? <p role="alert" className="text-down">News unavailable.</p>
      : <ul className="divide-y">{news.data.items.map(n => <li key={n.id} className="py-1.5">
        <a href={n.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{n.title}</a>
        <span className="block text-[11px] text-muted-foreground">{n.source} · {ago(n.publishedAt)}{n.symbols.length ? ` · ${n.symbols.slice(0, 4).join(', ')}` : ''}</span>
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
        return <li key={id}><button type="button" onClick={() => { onOpen(id); }} className="grid w-full grid-cols-[minmax(0,1fr)_auto_4rem] gap-2 py-1 text-left hover:bg-muted">
          <span className="truncate font-semibold">{id.slice(id.indexOf(':') + 1)}</span>
          <span className="num">{q ? formatPrice(q.price) : '—'}</span>
          <span className={`num text-right ${tone}`}>{q?.changePct == null ? '' : formatPct(q.changePct)}</span>
        </button></li>;
      })}</ul>}
  </Card>;
}

function Paper() {
  const accounts = useQuery({ queryKey: ['paper', 'accounts'], queryFn: ({ signal }) => apiFetch('v1/paper/accounts', { schema: PaperAccountsResponseSchema, signal }) });
  return <Card title="Paper accounts">
    {accounts.isPending ? <Skeleton className="h-12" /> : accounts.isError ? <p role="alert" className="text-down">Paper accounts unavailable.</p>
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
