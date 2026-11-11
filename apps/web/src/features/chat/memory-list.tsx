import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../../shared/api';
import { Button } from '../../shared/ui/button';

const KEY = ['agent', 'memory'];
const MemorySchema = z.strictObject({ notes: z.array(z.strictObject({ id: z.uuid(), note: z.string(), createdAt: z.string() })) });
const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });

/** Everything the assistant remembers about the user, each note deletable. */
export function MemoryList() {
  const client = useQueryClient();
  const memory = useQuery({ queryKey: KEY, queryFn: ({ signal }) => apiFetch('/v1/agent/memory', { schema: MemorySchema, signal }) });
  const forget = useMutation({ mutationFn: (id: string) => apiFetch(`/v1/agent/memory/${id}`, { schema: z.unknown(), method: 'DELETE' }),
    onSettled: () => client.invalidateQueries({ queryKey: KEY }) });
  if (memory.isPending) return <p className="text-muted-foreground">Loading memory…</p>;
  if (memory.isError) return <p role="alert" className="text-down">Memory is unavailable right now.</p>;
  if (memory.data.notes.length === 0) return <p className="text-muted-foreground">Nothing remembered yet. Tell the assistant, for example: “remember I risk 1% per trade”.</p>;
  return <ul aria-label="What the assistant remembers" className="space-y-1">
    {memory.data.notes.map(n => <li key={n.id} className="flex items-start gap-2 border p-2">
      <span className="min-w-0 flex-1">{n.note}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{day.format(Date.parse(n.createdAt))}</span>
      <Button size="xs" variant="ghost" aria-label={`Forget: ${n.note}`} disabled={forget.isPending} onClick={() => { forget.mutate(n.id); }}>×</Button>
    </li>)}
  </ul>;
}
