import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { AgentTaskSchema, type AgentTaskDto, type AlertCreate, type Interval } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { ApiError } from '../../shared/api/api-error';
import { Button } from '../../shared/ui/button';
import { useIndicatorCatalog } from '../indicators';

const KEY = ['agent', 'tasks'];
const listSchema = z.array(AgentTaskSchema);
const created = AgentTaskSchema.extend({ conditionNow: z.number().nullable() });
const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const STATE_TONE: Record<AgentTaskDto['state'], string> = { active: 'text-up', paused: 'text-muted-foreground', done: 'text-muted-foreground', cancelled: 'text-muted-foreground', expired: 'text-muted-foreground' };

/** Price or indicator alerts on the chart's symbol and interval, and every alert the user has: fired count, pause, resume, cancel. A fire lands in the bell. */
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
            onClick={() => { if (a.trigger.kind !== 'schedule') onOpenSymbol(a.trigger.symbol); }}>{a.title}</button>
          <span className={STATE_TONE[a.state]}>{a.state}</span>
          <span className="text-[11px] text-muted-foreground">
            {a.maxRuns > 1 ? `every crossing · fired ${String(a.runs)}` : a.runs > 0 ? 'fired' : 'once'}
            {a.lastRunAt ? ` · last ${time.format(Date.parse(a.lastRunAt))}` : ''}
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

function NewAlert({ symbol, interval, pending, error, last, onCreate }: { symbol: string; interval: Interval; pending: boolean; error: unknown; last: number | null;
  onCreate: (body: AlertCreate) => void }) {
  const catalog = useIndicatorCatalog();
  // '' is the price; otherwise a built-in's id, with one of its plots.
  const [on, setOn] = useState('');
  const [plot, setPlot] = useState('');
  const definition = catalog.data?.find(d => d.id === on);
  const plots = definition?.plots ?? [];
  const [op, setOp] = useState<'above' | 'below'>('above');
  const [value, setValue] = useState('');
  const [repeat, setRepeat] = useState(false);
  const level = Number(value);
  // Indicator values can be zero or negative (MACD, CCI); prices cannot.
  const valid = value.trim() !== '' && Number.isFinite(level) && (on !== '' || level > 0);
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!valid) return;
    const chosen = plots.find(p => p.id === plot) ?? plots[0];
    onCreate({ trigger: on === '' ? { kind: 'price', symbol, op, value: level }
      : { kind: 'indicator', symbol, interval, indicatorId: on, inputs: {}, ...(plots.length > 1 && chosen ? { plot: chosen.id } : {}), op, value: level }, repeat });
    setValue('');
  };
  return <form aria-label="New alert" onSubmit={submit} className="space-y-1.5 border-b px-3 py-2">
    <div className="flex items-center gap-1.5">
      <span className="min-w-0 truncate font-semibold">{symbol}</span>
      <select aria-label="Condition" className="h-6 max-w-28 border bg-panel px-1" value={on} onChange={e => { setOn(e.target.value); setPlot(''); }}>
        <option value="">Price</option>
        {(catalog.data ?? []).map(d => <option key={d.id} value={d.id}>{d.shortName} ({interval})</option>)}
      </select>
      {plots.length > 1 && <select aria-label="Plot" className="h-6 max-w-24 border bg-panel px-1" value={plot || plots[0]?.id} onChange={e => { setPlot(e.target.value); }}>
        {plots.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select>}
      <select aria-label="Direction" className="h-6 border bg-panel px-1" value={op} onChange={e => { setOp(e.target.value === 'below' ? 'below' : 'above'); }}>
        <option value="above">crosses above</option><option value="below">crosses below</option>
      </select>
      <input aria-label="Level" inputMode="decimal" className="num h-6 w-24 border bg-panel px-1" placeholder={on === '' ? 'price' : 'value'} value={value} onChange={e => { setValue(e.target.value); }} />
      <Button size="xs" type="submit" disabled={!valid || pending}>Add</Button>
    </div>
    <label className="flex items-center gap-1.5 text-muted-foreground"><input type="checkbox" checked={repeat} onChange={e => { setRepeat(e.target.checked); }} />Every crossing (30 days)</label>
    {error !== null && error !== undefined && <p role="alert" className="text-down">{error instanceof ApiError ? error.message : 'Alert not saved'}</p>}
    {last !== null && <p className="text-muted-foreground">Saved. Last price {last}.</p>}
  </form>;
}
