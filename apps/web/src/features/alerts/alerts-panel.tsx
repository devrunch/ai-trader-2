import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { AgentTaskSchema, type AgentTaskDto, type AlertCreate, type Interval } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { NewAlert } from './new-alert-form';
import { Button } from '../../shared/ui/button';

const KEY = ['agent', 'tasks'];
const listSchema = z.array(AgentTaskSchema);
const created = AgentTaskSchema.extend({ conditionNow: z.number().nullable() });
const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const openable = (t: AgentTaskDto['trigger']): string | null => (t.kind === 'price' || t.kind === 'indicator' ? t.symbol : t.kind === 'news' ? t.symbols[0] ?? null : null);
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
  const alerts = (list.data ?? []).filter(t => t.mode === 'notify');
  const live = alerts.filter(t => t.state === 'active' || t.state === 'paused');
  const past = alerts.filter(t => t.state !== 'active' && t.state !== 'paused').slice(0, 10);

  return <div className="flex h-full flex-col text-[12px]">
    <NewAlert symbol={symbol} interval={interval} pending={create.isPending} error={create.error}
      onCreate={body => { create.mutate(body); }} last={create.data?.conditionNow ?? null} />
    <div className="min-h-0 flex-1 overflow-auto">
      {list.isPending ? <p className="p-3 text-muted-foreground">Loading alerts…</p>
        : list.isError ? <p role="alert" className="p-3 text-down">Alerts are unavailable right now.</p>
        : alerts.length === 0 ? <p className="p-3 text-muted-foreground">No alerts yet. Set a level above; you'll get a notification when the price crosses it.</p>
        : <ul aria-label="Alerts">{[...live, ...past].map(a => <li key={a.id} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 border-b px-3 py-1.5">
          <button type="button" className="min-w-0 truncate text-left font-semibold hover:underline" title={a.instruction || a.title}
            onClick={() => { const s = openable(a.trigger); if (s) onOpenSymbol(s); }}>{a.title}</button>
          <span className={STATE_TONE[a.state]}>{a.state}</span>
          <span className="text-[11px] text-muted-foreground">
            {a.maxRuns > 1 ? `every crossing · fired ${String(a.runs)}` : a.runs > 0 ? 'fired' : 'once'}
            {a.lastRunAt ? ` · last ${time.format(Date.parse(a.lastRunAt))}` : ''}
            {a.lastOutcome ? ` · last outcome: ${a.lastOutcome}` : ''}
          </span>
          {(a.state === 'active' || a.state === 'paused') && <span className="flex gap-1">
            <Button size="xs" variant="ghost" disabled={change.isPending} onClick={() => { change.mutate({ id: a.id, verb: a.state === 'active' ? 'pause' : 'resume' }); }}>
              {a.state === 'active' ? 'Pause' : 'Resume'}</Button>
            <Button size="xs" variant="ghost" aria-label={`Delete alert ${a.title}`} disabled={change.isPending} onClick={() => { change.mutate({ id: a.id, verb: 'cancel' }); }}>×</Button>
          </span>}
        </li>)}</ul>}
    </div>
  </div>;
}

