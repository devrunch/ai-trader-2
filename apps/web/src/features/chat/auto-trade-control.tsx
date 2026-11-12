import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AgentTaskSchema, type AgentTaskDto, type AutoTrade } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { Button } from '../../shared/ui/button';

const DEFAULTS: AutoTrade = { enabled: true, maxRiskPct: 0.5, maxTradesPerDay: 3, requireBacktest: true };

/** Lets an agent task place PAPER orders by itself within limits; the server still runs the risk check on every order. */
export function AutoTradeControl({ task }: { task: AgentTaskDto }) {
  const client = useQueryClient();
  const saved = task.autoTrade?.enabled ? task.autoTrade : null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AutoTrade>(saved ?? DEFAULTS);
  const save = useMutation({
    mutationFn: (autoTrade: AutoTrade | null) => apiFetch(`/v1/agent/tasks/${task.id}/auto-trade`, { schema: AgentTaskSchema, method: 'POST', body: { autoTrade } }),
    onSuccess: () => { setOpen(false); },
    onSettled: () => client.invalidateQueries({ queryKey: ['agent', 'tasks'] }),
  });
  const on = saved !== null || open;
  const toggle = () => { if (on) { setOpen(false); if (saved) save.mutate(null); } else { setDraft(DEFAULTS); setOpen(true); } };
  const number = (label: string, value: number, min: number, max: number, step: number, set: (n: number) => void) =>
    <label className="flex items-center gap-1">{label}<input aria-label={label} type="number" min={min} max={max} step={step} value={value}
      onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) set(Math.min(max, Math.max(min, n))); }} className="w-16 rounded border bg-panel px-1" /></label>;

  return <div className="space-y-1">
    <div className="flex items-center gap-2">
      <button type="button" role="switch" aria-checked={on} aria-label="Auto-trade (PAPER)" disabled={save.isPending} onClick={toggle}
        className={`h-4 w-8 rounded-full border ${on ? 'bg-accent' : 'bg-muted'}`}><span className={`block h-3 w-3 rounded-full bg-white ${on ? 'ml-4' : 'ml-0.5'}`} /></button>
      <span className="text-[12px]">Auto-trade (PAPER)</span>
    </div>
    {(open || saved) && <div className="space-y-1 text-[12px]">
      <div className="flex flex-wrap items-center gap-3">
        {number('Max risk % per trade', draft.maxRiskPct, 0, 5, 0.1, n => { setDraft({ ...draft, maxRiskPct: n }); })}
        {number('Max trades per day', draft.maxTradesPerDay, 1, 20, 1, n => { setDraft({ ...draft, maxTradesPerDay: Math.round(n) }); })}
        <label className="flex items-center gap-1"><input type="checkbox" checked={draft.requireBacktest} onChange={e => { setDraft({ ...draft, requireBacktest: e.target.checked }); }} />Require a backtest first</label>
        <Button size="xs" disabled={save.isPending} onClick={() => { save.mutate({ ...draft, enabled: true }); }}>Save auto-trade</Button>
      </div>
      <p className="text-muted-foreground">Paper money only. Orders still pass the risk check.</p>
    </div>}
    {save.isError && <p role="alert" className="text-down">Could not save auto-trade.</p>}
  </div>;
}
