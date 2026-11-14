import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { AgentTaskSchema, BarsResponseSchema, CalendarResponseSchema, FundamentalsResponseSchema, PaperPositionsResponseSchema, SentimentTrendSchema } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { formatPct, formatPrice, useQuotes } from '../terminal';
import type { FocusView } from './focus-symbols';

const tone = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? 'text-muted-foreground' : v > 0 ? 'text-up' : 'text-down');
const fmt = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: digits }));
const ticker = (s: string) => s.split(':')[1] ?? s;
const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 py-0.5"><dt className="text-muted-foreground">{label}</dt><dd className="num text-right">{children}</dd></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-t px-3 py-2"><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4><dl className="text-sm">{children}</dl></section>;
}

/** Every figure the assistant and the user look at for one stock: price, fundamentals, mood, what is coming, the user's position and tasks, and the assistant's call. */
function FocusDetail({ symbol, view }: { symbol: string; view: FocusView | undefined }) {
  const bars = useQuery({ queryKey: ['focus', 'bars', symbol], staleTime: 300_000,
    queryFn: ({ signal }) => apiFetch(`v1/bars?symbol=${encodeURIComponent(symbol)}&interval=1D&limit=260`, { schema: BarsResponseSchema, signal }) });
  const nse = symbol.startsWith('NSE:');
  const fundamentals = useQuery({ queryKey: ['focus', 'fundamentals', symbol], enabled: nse, staleTime: 3_600_000, retry: false,
    queryFn: ({ signal }) => apiFetch(`v1/fundamentals/${encodeURIComponent(symbol)}`, { schema: FundamentalsResponseSchema, signal }) });
  const mood = useQuery({ queryKey: ['focus', 'sentiment', symbol], staleTime: 300_000, retry: false,
    queryFn: ({ signal }) => apiFetch(`v1/news/sentiment?symbol=${encodeURIComponent(symbol)}`, { schema: SentimentTrendSchema, signal }) });
  const calendar = useQuery({ queryKey: ['focus', 'calendar'], staleTime: 600_000,
    queryFn: ({ signal }) => apiFetch('v1/calendar?days=7&impact=Medium', { schema: CalendarResponseSchema, signal }) });
  const positions = useQuery({ queryKey: ['paper', 'positions'], queryFn: ({ signal }) => apiFetch('v1/paper/positions', { schema: PaperPositionsResponseSchema, signal }) });
  const tasks = useQuery({ queryKey: ['agent', 'tasks'], queryFn: ({ signal }) => apiFetch('/v1/agent/tasks', { schema: z.array(AgentTaskSchema), signal }) });

  const [now] = useState(() => Date.now());
  const daily = bars.data?.bars ?? [];
  const last = daily.at(-1);
  const year = daily.slice(-252);
  const hi = year.length ? Math.max(...year.map(b => b.high)) : null;
  const lo = year.length ? Math.min(...year.map(b => b.low)) : null;
  const vols = daily.slice(-21, -1).map(b => b.volume ?? 0).filter(v => v > 0);
  const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;
  const volRatio = last?.volume && avgVol ? last.volume / avgVol : null;
  const inRange = hi !== null && lo !== null && last && hi > lo ? ((last.close - lo) / (hi - lo)) * 100 : null;
  const r = fundamentals.data?.ratios;
  const week = mood.data?.windows.find(w => w.hours >= 168) ?? mood.data?.windows.at(-1);
  const today = mood.data?.windows.find(w => w.hours <= 24);
  const next = (calendar.data?.events ?? []).filter(e => e.moves.includes(symbol) && Date.parse(e.at) > now).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
  const position = positions.data?.positions.find(p => p.instrumentId === symbol && p.quantity !== 0);
  const mine = (tasks.data ?? []).filter(t => (t.state === 'active' || t.state === 'paused') && JSON.stringify(t.trigger).includes(`"${symbol}"`));

  return <div className="text-sm">
    <Section title="Price">
      <Row label="Day range">{last ? `${formatPrice(last.low)} – ${formatPrice(last.high)}` : '—'}</Row>
      <Row label="Volume vs usual">{volRatio === null ? '—' : `${fmt(volRatio, 2)}×`}</Row>
      <Row label="52-week range">{hi === null || lo === null ? '—' : `${formatPrice(lo)} – ${formatPrice(hi)}`}</Row>
      <Row label="Where in the range">{inRange === null ? '—' : `${fmt(inRange, 0)}%`}</Row>
    </Section>
    {nse && <Section title="Fundamentals">
      {fundamentals.isError ? <p className="text-muted-foreground">Not available for this stock yet.</p> : <>
        <Row label="P/E">{fmt(r?.pe)}</Row><Row label="ROE">{r?.roe == null ? '—' : `${fmt(r.roe)}%`}</Row>
        <Row label="Debt / equity">{fmt(r?.debtToEquity, 2)}</Row>
        <Row label="Sales growth 3y">{r?.salesGrowth3y == null ? '—' : `${fmt(r.salesGrowth3y)}%`}</Row>
        <Row label="Profit growth 3y">{r?.profitGrowth3y == null ? '—' : `${fmt(r.profitGrowth3y)}%`}</Row>
        <Row label="Promoter holding">{r?.promoterHolding == null ? '—' : `${fmt(r.promoterHolding)}%`}</Row></>}
    </Section>}
    <Section title="Mood">
      <Row label="News today"><span className={tone(today?.score)}>{today?.score == null ? 'quiet' : fmt(today.score, 2)}</span>{today ? ` · ${String(today.items)} items` : ''}</Row>
      <Row label="This week"><span className={tone(week?.score)}>{week?.score == null ? '—' : fmt(week.score, 2)}</span>{week ? ` · ${String(week.bullish)} up / ${String(week.bearish)} down` : ''}</Row>
    </Section>
    <Section title="Coming up">
      {next ? <Row label={day.format(Date.parse(next.at))}>{next.title}</Row> : <p className="text-muted-foreground">Nothing scheduled this week that usually moves it.</p>}
    </Section>
    <Section title="Yours">
      <Row label="Position">{position ? <span className={tone(position.unrealisedPnl)}>{`${String(position.quantity)} @ ${formatPrice(position.averagePrice)} · ${fmt(position.unrealisedPnl, 0)}`}</span> : 'none'}</Row>
      {mine.length === 0 ? <Row label="Tasks">none</Row> : mine.map(t => <Row key={t.id} label={t.state === 'paused' ? 'Paused' : 'Task'}><span className="block max-w-[14rem] truncate" title={t.title}>{t.title}</span></Row>)}
    </Section>
    <Section title="Assistant's view">
      {view ? <>
        <Row label="Call"><span className={view.action === 'BUY' ? 'text-up' : view.action === 'SELL' ? 'text-down' : ''}>{view.action}</span>{view.confidence === null ? '' : ` · ${fmt(view.confidence * 100, 0)}% sure`}</Row>
        {view.entry !== null && <Row label="Entry · stop · target">{`${formatPrice(view.entry)} · ${view.stopLoss === null ? '—' : formatPrice(view.stopLoss)} · ${view.target === null ? '—' : formatPrice(view.target)}`}</Row>}
      </> : <p className="text-muted-foreground">No call yet. Ask for one in the chat.</p>}
    </Section>
  </div>;
}

/** The stocks in the conversation. One is open in full, the others are one row each, so the panel stays readable however many there are. */
export function FocusPanel({ symbols, views }: { symbols: string[]; views: Map<string, FocusView> }) {
  const quotes = useQuotes(symbols);
  const [open, setOpen] = useState<string | null>(null);
  const active = open !== null && symbols.includes(open) ? open : symbols[0] ?? null;
  if (symbols.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">Stocks you talk about with the assistant show here, with their numbers and the assistant&apos;s call.</div>;
  }
  return <ul aria-label="Stocks in focus" className="text-sm">{symbols.map(symbol => {
    const q = quotes.data?.get(symbol);
    const view = views.get(symbol);
    const expanded = symbol === active;
    return <li key={symbol} className="border-b">
      <button type="button" aria-expanded={expanded} onClick={() => { setOpen(symbol); }}
        className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-3 px-3 py-2 text-left hover:bg-muted ${expanded ? 'bg-muted/60' : ''}`}>
        <span className="min-w-0"><span className="block truncate font-semibold">{ticker(symbol)}</span><span className="block text-xs text-muted-foreground">{symbol.split(':')[0]}</span></span>
        <span className="num text-right"><span className="block">{q ? formatPrice(q.price) : '—'}</span>
          <span className={`block text-xs ${tone(q?.changePct)}`}>{q?.changePct == null ? '' : formatPct(q.changePct)}</span></span>
        <span className={`w-12 text-right text-xs font-semibold ${view?.action === 'BUY' ? 'text-up' : view?.action === 'SELL' ? 'text-down' : 'text-muted-foreground'}`}>{view?.action ?? ''}</span>
      </button>
      {expanded && <FocusDetail symbol={symbol} view={view} />}
    </li>;
  })}</ul>;
}
