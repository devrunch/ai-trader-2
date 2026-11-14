import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useContext } from 'react';
import { z } from 'zod';
import { BellPlus, ChartCandlestick, PencilRuler, Sparkles, Users } from 'lucide-react';
import type { Drawing, TradePlanDto } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import { useChatActions } from './chat-actions';
import { ActionCard } from './action-card';
import { ChatAskContext } from './chat-view';

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: n >= 100 ? 2 : 4 });
const money = (n: number, currency: string) => n.toLocaleString('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 });

/** Stop, entry and targets on one bar: the red part is what you risk, the green part what you aim for. */
function RiskRewardBar({ plan }: { plan: TradePlanDto }) {
  const far = plan.targets[plan.targets.length - 1] ?? plan.entry;
  const lo = Math.min(plan.stopLoss, far); const hi = Math.max(plan.stopLoss, far);
  const pos = (p: number) => `${String(((p - lo) / (hi - lo || 1)) * 100)}%`;
  const buy = plan.side === 'buy';
  const [riskFrom, riskTo] = buy ? [plan.stopLoss, plan.entry] : [plan.entry, plan.stopLoss];
  const [rewFrom, rewTo] = buy ? [plan.entry, far] : [far, plan.entry];
  return <div className="relative mt-7 mb-9 h-2" aria-hidden="true">
    <div className="absolute inset-y-0 bg-down/70" style={{ left: pos(riskFrom), width: `calc(${pos(riskTo)} - ${pos(riskFrom)})` }} />
    <div className="absolute inset-y-0 bg-up/70" style={{ left: pos(rewFrom), width: `calc(${pos(rewTo)} - ${pos(rewFrom)})` }} />
    {[{ p: plan.stopLoss, label: 'Stop', cls: 'text-down', below: true }, { p: plan.entry, label: 'Entry', cls: 'text-foreground', below: false },
      ...plan.targets.map((t, i) => ({ p: t, label: `T${String(i + 1)}`, cls: 'text-up', below: i % 2 === 0 }))].map(m =>
      <span key={m.label} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: pos(m.p) }}>
        <span className={`block h-4 w-0.5 ${m.label === 'Entry' ? 'bg-foreground' : 'bg-current'} ${m.cls}`} />
        <span className={`num absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold ${m.cls} ${m.below ? 'top-5' : 'bottom-5'}`}>{m.label} {fmt(m.p)}</span>
      </span>)}
  </div>;
}

function drawingFor(plan: TradePlanDto): Drawing {
  const now = Date.now(); const from = now - 6 * 3_600_000; const to = now + 2 * 3_600_000;
  const line = (price: number, label: string) => ({ from: { time: from, price }, to: { time: to, price }, label });
  return { symbol: plan.symbol, interval: plan.interval, note: `${plan.side === 'buy' ? 'Buy' : 'Sell'} plan from the assistant`, barsUsed: 0, lastBarTime: null, status: { state: 'ok' },
    segments: [line(plan.entry, `Entry ${fmt(plan.entry)}`), line(plan.stopLoss, `Stop ${fmt(plan.stopLoss)}`), ...plan.targets.map((t, i) => line(t, `T${String(i + 1)} ${fmt(t)}`))] };
}

/** A trade idea from the assistant as something to act on: levels on a bar, size and risk, and one click to chart it, alert on it or place it on paper. */
export function TradePlanCard({ plan }: { plan: TradePlanDto }) {
  const host = useChatActions();
  const client = useQueryClient();
  const ask = useContext(ChatAskContext);
  const buy = plan.side === 'buy';
  const draw = useMutation({ mutationFn: () => { host.addDrawing(plan.id, drawingFor(plan)); return Promise.resolve(); } });
  const alerts = useMutation({ mutationFn: async () => {
    const t1 = plan.targets[0] ?? plan.entry;
    const make = (op: 'above' | 'below', value: number, note: string) => apiFetch('/v1/agent/tasks/alerts', { method: 'POST', schema: z.unknown(),
      body: { trigger: { kind: 'price', symbol: plan.symbol, op, value }, repeat: false, note } });
    await make(buy ? 'below' : 'above', plan.stopLoss, `${plan.symbol} hit the plan's stop`);
    await make(buy ? 'above' : 'below', t1, `${plan.symbol} reached target 1`);
  }, onSettled: () => client.invalidateQueries({ queryKey: ['agent', 'tasks'] }) });
  const pct = Math.round(plan.confidence * 100);
  return <article className="ai-border space-y-3 p-3 text-sm" aria-label={`Trade plan: ${plan.side} ${plan.symbol}`}>
    <header className="flex flex-wrap items-center gap-2">
      <Sparkles className="size-3.5 text-[var(--link)]" aria-hidden="true" />
      <span className="font-semibold">{plan.symbol.split(':')[1] ?? plan.symbol}</span>
      <span className={`px-1.5 py-0.5 text-[11px] font-bold uppercase ${buy ? 'bg-up/15 text-up' : 'bg-down/15 text-down'}`}>{plan.side}</span>
      <span className="text-muted-foreground">{plan.interval} · {plan.horizon}</span>
      {plan.skill && <span className="ml-auto border px-1.5 py-0.5 text-[11px] text-muted-foreground">{plan.skill}</span>}
    </header>
    <div className="flex items-center gap-2" title="How sure the assistant is">
      <span className="text-muted-foreground">Confidence</span>
      <span className="h-1.5 flex-1 bg-muted"><span className="block h-full ai-gradient" style={{ width: `${String(pct)}%` }} /></span>
      <span className="num font-semibold">{pct}%</span>
    </div>
    <RiskRewardBar plan={plan} />
    <dl className="grid grid-cols-3 gap-2 num">
      <div><dt className="text-muted-foreground">Risk / unit</dt><dd className="font-semibold text-down">{fmt(plan.riskPerUnit)}</dd></div>
      <div><dt className="text-muted-foreground">Reward : risk</dt><dd className="font-semibold text-up">{plan.rewards.map(r => `${String(r.rewardRisk)}R`).join(' / ')}</dd></div>
      <div><dt className="text-muted-foreground">Size</dt><dd className="font-semibold">{plan.sizing ? plan.sizing.quantity.toLocaleString('en-IN') : 'too small'}</dd></div>
    </dl>
    {plan.sizing && <p className="text-muted-foreground">Loses {money(plan.sizing.riskAmount, plan.sizing.currency)} at the stop, {String(plan.sizing.riskPct)}% of the paper account.</p>}
    <p className="leading-relaxed">{plan.rationale}</p>
    {plan.invalidation && <p className="text-muted-foreground"><span className="font-semibold text-foreground">Wrong if:</span> {plan.invalidation}</p>}
    <div className="flex flex-wrap gap-1.5">
      <Button size="xs" variant="outline" onClick={() => { host.openSymbol(plan.symbol, plan.interval); }}><ChartCandlestick />Open chart</Button>
      <Button size="xs" variant="outline" disabled={draw.isSuccess} onClick={() => { draw.mutate(); }}><PencilRuler />{draw.isSuccess ? 'Drawn' : draw.isError ? 'Open the terminal to draw' : 'Draw levels'}</Button>
      <Button size="xs" variant="outline" disabled={alerts.isPending || alerts.isSuccess} onClick={() => { alerts.mutate(); }}><BellPlus />{alerts.isSuccess ? 'Alerts set' : alerts.isError ? 'Alerts failed, retry' : 'Alert at stop and T1'}</Button>
      {ask && <Button size="xs" variant="outline" onClick={() => { ask(`Ask the desk about ${plan.symbol}`); }}><Users />Ask the desk</Button>}
    </div>
    {plan.orderCard && <ActionCard proposed={plan.orderCard} />}
  </article>;
}
