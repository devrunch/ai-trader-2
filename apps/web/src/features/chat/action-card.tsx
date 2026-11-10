import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActionCardSchema, INTERVALS, type ActionCardDto, type AgentAction } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import { useIndicatorStore } from '../indicators';
import { useChatActions } from './chat-actions';

type Inputs = Record<string, number | boolean | string>;
const key = (id: string) => ['agent', 'action', id] as const;

const describe = (action: AgentAction): string => action.kind === 'add-indicator'
  ? `Add ${action.indicatorId.toUpperCase()} to the chart`
  : `Open ${action.symbol}${action.interval ? ` on ${action.interval}` : ''}`;

const parseValue = (raw: string, previous: unknown): number | boolean | string => {
  if (typeof previous === 'boolean') return raw === 'true';
  if (typeof previous === 'number' && raw.trim() !== '' && Number.isFinite(Number(raw))) return Number(raw);
  return raw;
};

/** A change the assistant proposed (FR-AG-17). Nothing happens until the user applies it; fields can be edited first. */
export function ActionCard({ proposed }: { proposed: ActionCardDto }) {
  const client = useQueryClient();
  const host = useChatActions();
  const addIndicator = useIndicatorStore(state => state.add);
  const card = useQuery({ queryKey: key(proposed.id), initialData: proposed, staleTime: 0,
    queryFn: ({ signal }) => apiFetch(`/v1/agent/actions/${proposed.id}`, { schema: ActionCardSchema, signal }) });
  const [draft, setDraft] = useState<AgentAction | null>(null);
  const current = card.data;
  const action = draft ?? current.action;
  const settle = (next: ActionCardDto) => { client.setQueryData(key(proposed.id), next); setDraft(null); };

  const run = (applied: AgentAction) => {
    if (applied.kind === 'add-indicator') addIndicator(applied.indicatorId, applied.inputs);
    else host.openSymbol(applied.symbol, applied.interval);
  };
  // A read still in flight from before the decision must not overwrite it.
  const hold = () => client.cancelQueries({ queryKey: key(proposed.id) });
  const apply = useMutation({
    onMutate: hold,
    mutationFn: () => apiFetch(`/v1/agent/actions/${proposed.id}/apply`, { schema: ActionCardSchema, method: 'POST', body: draft ? { action: draft } : {} }),
    onSuccess: next => {
      try { run(next.action); settle(next); }
      catch (error) {
        const reason = error instanceof Error ? error.message : 'Could not apply on this screen';
        void apiFetch(`/v1/agent/actions/${proposed.id}/fail`, { schema: ActionCardSchema, method: 'POST', body: { reason } }).then(settle);
      }
    },
  });
  const dismiss = useMutation({ onMutate: hold, mutationFn: () => apiFetch(`/v1/agent/actions/${proposed.id}/dismiss`, { schema: ActionCardSchema, method: 'POST' }), onSuccess: settle });
  const pending = current.state === 'pending';

  return <div role="group" aria-label="Proposed change" className="space-y-2 rounded border p-2 text-xs">
    <div className="flex items-center justify-between gap-2"><span className="font-medium">{describe(action)}</span><StateBadge card={current} /></div>
    {pending && <Fields action={action} onChange={setDraft} />}
    {current.state === 'failed' && current.reason && <p className="text-down">{current.reason}</p>}
    {(apply.isError || dismiss.isError) && <p role="alert" className="text-down">Not done: the card may have expired or changed. {apply.error?.message ?? dismiss.error?.message}</p>}
    {pending && <div className="flex gap-2">
      <Button size="xs" disabled={apply.isPending} onClick={() => { apply.mutate(); }}>{apply.isPending ? 'Applying…' : 'Apply'}</Button>
      <Button size="xs" variant="ghost" disabled={dismiss.isPending} onClick={() => { dismiss.mutate(); }}>Dismiss</Button>
    </div>}
  </div>;
}

function StateBadge({ card }: { card: ActionCardDto }) {
  const tone = card.state === 'applied' ? 'text-up' : card.state === 'failed' ? 'text-down' : 'text-muted-foreground';
  const label = card.state === 'pending' ? `expires ${new Date(card.expiresAt).toLocaleTimeString()}` : card.state;
  return <span className={tone}>{label}</span>;
}

function Fields({ action, onChange }: { action: AgentAction; onChange: (next: AgentAction) => void }) {
  if (action.kind === 'open-symbol') {
    return <div className="flex flex-wrap gap-2">
      <label className="flex items-center gap-1">Symbol<input aria-label="Symbol" value={action.symbol} onChange={e => { onChange({ ...action, symbol: e.target.value.toUpperCase() }); }}
        className="w-32 rounded border bg-panel px-1" /></label>
      <label className="flex items-center gap-1">Interval<select aria-label="Interval" value={action.interval ?? ''} className="rounded border bg-panel px-1"
        onChange={e => { const value = INTERVALS.find(i => i === e.target.value); onChange(value ? { ...action, interval: value } : { kind: action.kind, symbol: action.symbol }); }}>
        <option value="">current</option>{INTERVALS.map(i => <option key={i} value={i}>{i}</option>)}
      </select></label>
    </div>;
  }
  const inputs: Inputs = action.inputs;
  const entries = Object.entries(inputs);
  if (entries.length === 0) return <p className="text-muted-foreground">Default inputs.</p>;
  return <div className="flex flex-wrap gap-2">{entries.map(([name, value]) => <label key={name} className="flex items-center gap-1">{name}
    <input aria-label={name} value={String(value)} onChange={e => { onChange({ ...action, inputs: { ...inputs, [name]: parseValue(e.target.value, value) } }); }}
      className="w-20 rounded border bg-panel px-1" /></label>)}</div>;
}
