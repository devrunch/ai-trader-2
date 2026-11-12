import type { DeskRunDto } from '@aitrader/contracts';
import { actionTone, percent, price, time } from './desk-format';
import { Debate, RoleCards } from './role-cards';

function Decision({ run }: { run: DeskRunDto }) {
  const d = run.decision;
  return <section aria-label="Decision" className="rounded border p-2">
    <h4 className="mb-1 font-semibold">Final decision (PAPER only)</h4>
    {d.vetoed && <div role="alert" className="mb-1 rounded border border-down p-1.5 text-down">
      Risk manager blocked this trade: {d.vetoReasons.join('; ') || 'no reason given'}</div>}
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 sm:grid-cols-[auto_1fr_auto_1fr]">
      <dt>Entry</dt><dd className="num">{price(d.entry)}</dd><dt>Stop</dt><dd className="num">{price(d.stopLoss)}</dd>
      <dt>Target</dt><dd className="num">{price(d.target)}</dd><dt>Quantity (paper)</dt><dd className="num">{d.quantity ?? '—'}</dd>
    </dl>
    {d.summary !== '' && <p className="mt-1">{d.summary}</p>}
  </section>;
}

export function RunView({ run }: { run: DeskRunDto }) {
  const { trail } = run;
  return <div className="space-y-3 text-[12px]">
    <header className="flex flex-wrap items-baseline gap-x-3">
      <span aria-label="Decision action" className={`rounded border px-2 text-[14px] font-semibold ${actionTone(run.decision.action)}`}>{run.decision.action}</span>
      <span className="num">{percent(run.decision.confidence)} confidence</span>
      <span>as of {time(run.asOf)}</span>
      {!run.live && <span className="rounded bg-muted px-1.5 text-[11px]">time machine</span>}
      <span className="text-muted-foreground">{run.symbol} · {run.tokens} tokens · {run.calls} calls</span>
    </header>
    {run.status === 'budget' && <p role="alert" className="text-down">This run was stopped by the token budget, so the answer below may be incomplete.</p>}
    {run.status === 'error' && <p role="alert" className="text-down">The run failed: {run.error ?? 'unknown error'}</p>}
    <Decision run={run} />
    <RoleCards reports={trail.reports} />
    <section aria-label="Debate"><h4 className="mb-1 font-semibold">Bull vs bear debate</h4><Debate debate={trail.debate} /></section>
    <section aria-label="Trader and risk" className="space-y-1 rounded border p-2">
      <h4 className="font-semibold">Trader proposal</h4>
      {trail.proposal ? <p>{trail.proposal.action} at {price(trail.proposal.entry)}, stop {price(trail.proposal.stopLoss)}, target {price(trail.proposal.target)}: {trail.proposal.rationale}</p>
        : <p className="text-muted-foreground">No proposal: the run stopped before the trader.</p>}
      <h4 className="font-semibold">Risk review</h4>
      {trail.riskReview ? <p>{trail.riskReview.approve ? 'Approved' : 'Rejected'}{trail.riskReview.reasons.length > 0 && `: ${trail.riskReview.reasons.join('; ')}`}</p>
        : <p className="text-muted-foreground">No risk review.</p>}
      <p>Code gate: <span className={trail.gate.pass ? 'text-up' : 'text-down'}>{trail.gate.pass ? 'pass' : 'blocked'}</span>{trail.gate.blocks.length > 0 && ` (${trail.gate.blocks.join('; ')})`}</p>
    </section>
  </div>;
}
