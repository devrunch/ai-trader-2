import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { AgentTaskSchema, type AgentTaskDto, type AlertCreate, type Interval } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { NewAlert } from './new-alert-form';
import { Button } from '../../shared/ui/button';
import { useState } from 'react';
import { AutoTradeControl, describeTrigger } from '../chat';

const KEY = ['agent', 'tasks'];
const listSchema = z.array(AgentTaskSchema);
const created = AgentTaskSchema.extend({ conditionNow: z.number().nullable() });
const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const openable = (t: AgentTaskDto['trigger']): string | null => (t.kind === 'price' || t.kind === 'indicator' ? t.symbol : t.kind === 'news' ? t.symbols[0] ?? null : null);
const OUTCOME: Record<NonNullable<AgentTaskDto['lastOutcome']>, string> = {
  ran: 'ran', report: 'reported to you', silent: 'checked, nothing worth telling', notified: 'notified you', capped: 'skipped: daily limit', error: 'failed' };
const STATE_TONE: Record<AgentTaskDto['state'], string> = { active: 'text-up', paused: 'text-muted-foreground', done: 'text-muted-foreground', cancelled: 'text-muted-foreground', expired: 'text-muted-foreground' };

/** Price, indicator, news and event alerts on the chart's symbol and interval, and every alert the user has: fired count, pause, resume, cancel. A fire lands in the bell. */
export function AlertsPanel({ symbol, interval, onOpenSymbol }: { symbol: string; interval: Interval; onOpenSymbol: (symbol: string) => void }) {
  const client = useQueryClient();
  const list = useQuery({ queryKey: KEY, refetchInterval: 30_000, queryFn: ({ signal }) => apiFetch('/v1/agent/tasks', { schema: listSchema, signal }) });
  const create = useMutation({ retry: 0,
    mutationFn: (body: AlertCreate) => apiFetch('/v1/agent/tasks/alerts', { method: 'POST', body, schema: created }),
    onSettled: () => client.invalidateQueries({ queryKey: KEY }) });
  const change = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: 'pause' | 'resume' | 'cancel' }) => apiFetch(`/v1/agent/tasks/${id}/${verb}`, { schema: AgentTaskSchema, method: 'POST' }),
    onSettled: () => client.invalidateQueries({ queryKey: KEY }) });
  const [show, setShow] = useState<'all' | 'notify' | 'agent'>('all');
  const all = list.data ?? [];
  const shown = all.filter(t => show === 'all' || t.mode === show);
  const live = shown.filter(t => t.state === 'active' || t.state === 'paused');
  const past = shown.filter(t => t.state !== 'active' && t.state !== 'paused').slice(0, 10);
  const count = (mode: 'notify' | 'agent') => all.filter(t => t.mode === mode && (t.state === 'active' || t.state === 'paused')).length;

  return <div className="flex h-full flex-col text-sm">
    <NewAlert symbol={symbol} interval={interval} pending={create.isPending} error={create.error}
      onCreate={body => { create.mutate(body); }} last={create.data?.conditionNow ?? null} />
    <div role="tablist" aria-label="Show" className="flex gap-1 border-b px-3 py-1.5">
      {([['all', 'All'], ['notify', `Alerts (${String(count('notify'))})`], ['agent', `Tasks (${String(count('agent'))})`]] as const).map(([id, label]) =>
        <button key={id} type="button" role="tab" aria-selected={show === id} onClick={() => { setShow(id); }}
          className={`px-2 py-1 ${show === id ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>)}
    </div>
    <div className="min-h-0 flex-1 overflow-auto">
      {list.isPending ? <p className="p-3 text-muted-foreground">Loading alerts…</p>
        : list.isError ? <p role="alert" className="p-3 text-down">Alerts are unavailable right now. They will load again on their own; check your connection if this stays.</p>
        : shown.length === 0 ? <div className="space-y-1 p-3 text-muted-foreground">
          <p>{show === 'agent' ? 'Nothing is being watched yet.' : 'No alerts yet.'}</p>
          <p>{show === 'agent' ? 'Ask the assistant, for example “watch INR news with high impact and tell me if it matters”. It wakes on a match and decides whether to tell you.'
            : 'Set a price, indicator, news or event condition above. You get a notification in the bell when it triggers.'}</p></div>
        : <ul aria-label="Alerts">{[...live, ...past].map(a => <li key={a.id} className="space-y-1 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <span className={`shrink-0 px-1.5 py-px text-[11px] font-semibold ${a.mode === 'agent' ? 'ai-gradient' : 'border text-muted-foreground'}`}>{a.mode === 'agent' ? 'Task' : 'Alert'}</span>
            <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold hover:underline" title={a.instruction || a.title}
              onClick={() => { const s = openable(a.trigger); if (s) onOpenSymbol(s); }}>{a.title}</button>
            <span className={STATE_TONE[a.state]}>{a.runState === 'running' ? 'waking now…' : a.runState === 'queued' ? 'queued' : a.state}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {describeTrigger(a)}{a.desk ? ' · asks the trading desk' : ''}
            {a.maxRuns > 1 ? ` · fired ${String(a.runs)}` : a.runs > 0 ? ' · fired' : ''}
            {a.lastRunAt ? ` · last ${time.format(Date.parse(a.lastRunAt))}` : ''}
            {a.lastOutcome ? ` · ${OUTCOME[a.lastOutcome]}` : ''}
          </p>
          {a.lastError && <p className="text-xs text-down">Last run failed: {a.lastError}</p>}
          {a.mode === 'agent' && a.state === 'active' && <AutoTradeControl task={a} />}
          {(a.state === 'active' || a.state === 'paused') && <div className="flex gap-1">
            <Button size="xs" variant="ghost" disabled={change.isPending} onClick={() => { change.mutate({ id: a.id, verb: a.state === 'active' ? 'pause' : 'resume' }); }}>
              {a.state === 'active' ? 'Pause' : 'Resume'}</Button>
            <Button size="xs" variant="ghost" aria-label={`Delete alert ${a.title}`} disabled={change.isPending} onClick={() => { change.mutate({ id: a.id, verb: 'cancel' }); }}>Delete</Button>
          </div>}
        </li>)}</ul>}
    </div>
  </div>;
}
