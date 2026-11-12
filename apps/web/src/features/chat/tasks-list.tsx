import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { AgentTaskSchema, type AgentTaskDto } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { Button } from '../../shared/ui/button';

const listSchema = z.array(AgentTaskSchema);
const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

const when = (task: AgentTaskDto): string => {
  const t = task.trigger;
  if (t.kind === 'schedule') return `on schedule ${t.cron} (${t.tz})`;
  if (t.kind === 'news') return `on matching ${t.markets.join('/')} news`;
  if (t.kind === 'event') return `${String(t.afterMinutes)} min after matching ${t.countries.join('/') || 'any'} events`;
  const what = t.kind === 'price' ? t.symbol : `${t.indicatorId.toUpperCase()} on ${t.symbol} ${t.interval}`;
  return `when ${what} goes ${t.op} ${String(t.value)}`;
};

/** The assistant's background tasks: what wakes each one, how often it ran, and pause, resume or cancel. */
export function TasksList({ onOpenThread }: { onOpenThread: (threadId: string) => void }) {
  const client = useQueryClient();
  const tasks = useQuery({ queryKey: ['agent', 'tasks'], refetchInterval: 30_000,
    queryFn: ({ signal }) => apiFetch('/v1/agent/tasks', { schema: listSchema, signal }) });
  const change = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: 'pause' | 'resume' | 'cancel' }) => apiFetch(`/v1/agent/tasks/${id}/${verb}`, { schema: AgentTaskSchema, method: 'POST' }),
    onSettled: () => client.invalidateQueries({ queryKey: ['agent', 'tasks'] }),
  });
  if (tasks.isPending) return <p className="text-muted-foreground">Loading tasks…</p>;
  if (tasks.isError) return <p role="alert" className="text-down">Tasks are unavailable right now.</p>;
  // Alerts live in the Alerts widget; this list is the assistant's own work.
  const mine = tasks.data.filter((t): t is AgentTaskDto & { threadId: string } => t.mode === 'agent' && t.threadId !== null);
  if (mine.length === 0) return <p className="text-muted-foreground">No background tasks. Ask the assistant, for example: “every weekday at 9:20, check NIFTY's trend and tell me”.</p>;
  return <ul aria-label="Background tasks" className="space-y-2">
    {mine.map(task => <li key={task.id} className="space-y-1 border p-2">
      <div className="flex items-center gap-2">
        <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold hover:underline" onClick={() => { onOpenThread(task.threadId); }}>{task.title}</button>
        <span className={task.state === 'active' ? 'text-up' : 'text-muted-foreground'}>{task.state}</span>
      </div>
      <p className="text-[12px] text-muted-foreground">Runs {when(task)} · {task.runs}/{task.maxRuns} runs
        {task.nextRunAt && task.state === 'active' ? ` · next ${time.format(Date.parse(task.nextRunAt))}` : ''}
        {task.lastRunAt ? ` · last ${time.format(Date.parse(task.lastRunAt))}` : ''}</p>
      {task.lastError && <p className="text-[12px] text-down">Last run failed: {task.lastError}</p>}
      {(task.state === 'active' || task.state === 'paused') && <div className="flex gap-1">
        <Button size="xs" variant="outline" disabled={change.isPending}
          onClick={() => { change.mutate({ id: task.id, verb: task.state === 'active' ? 'pause' : 'resume' }); }}>{task.state === 'active' ? 'Pause' : 'Resume'}</Button>
        <Button size="xs" variant="ghost" disabled={change.isPending} onClick={() => { change.mutate({ id: task.id, verb: 'cancel' }); }}>Cancel</Button>
      </div>}
    </li>)}
  </ul>;
}
