import type { DeskRunDto } from '@aitrader/contracts';
import { actionTone, percent, price, time } from './desk-format';
import { Debate, RoleCards } from './role-cards';

function Decision({ run }: { run: DeskRunDto }) {
  const d = run.decision;
  return <section aria-label="Decision" className="ai-border p-4">
    <h4 className="mb-2 font-semibold">Final decision <span className="font-normal text-muted-foreground">(paper only)</span></h4>
    {d.vetoed && <div role="alert" className="mb-1 rounded border border-down p-1.5 text-down">
      Risk manager blocked this trade: {d.vetoReasons.join('; ') || 'no reason given'}</div>}
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 [&_dt]:text-[11px] [&_dt]:text-muted-foreground [&_dd]:text-[15px] [&_dd]:font-semibold">
      <dt>Entry</dt><dd className="num">{price(d.entry)}</dd><dt>Stop</dt><dd className="num">{price(d.stopLoss)}</dd>
      <dt>Target</dt><dd className="num">{price(d.target)}</dd><dt>Quantity (paper)</dt><dd className="num">{d.quantity ?? '—'}</dd>
    </dl>
    {d.summary !== '' && <p className="mt-1">{d.summary}</p>}
  </section>;
}

const STAGES = ['Analysts', 'Bull vs bear', 'Trader', 'Risk manager'] as const;

/** Which step the desk is on, read from what it has saved so far. */
function stageOf(run: DeskRunDto): number {
  const { trail } = run;
  if (trail.riskReview || run.status !== 'running') return 4;
  if (trail.proposal) return 3;
  if (trail.debate.length > 0) return 2;
  return Object.values(trail.reports).some(r => !('skipped' in r)) ? 1 : 0;
}

function Progress({ run }: { run: DeskRunDto }) {
  const at = stageOf(run);
  return <section role="status" aria-label="Desk progress" className="ai-border p-4">
    <p className="mb-3 font-semibold">The desk is working on {run.symbol}. You can leave this page; the header shows when it is done.</p>
    <ol className="grid grid-cols-4 gap-2">{STAGES.map((stage, i) => <li key={stage} className="space-y-1.5">
      <span className={`block h-1 ${i < at ? 'ai-gradient' : i === at ? 'animate-pulse bg-[var(--ai-2)]/60' : 'bg-muted'}`} />
      <span className={`block text-[11px] ${i <= at ? 'text-foreground' : 'text-muted-foreground'}`}>{stage}{i < at ? ' ✓' : i === at ? '…' : ''}</span>
    </li>)}</ol>
  </section>;
}

export function RunView({ run }: { run: DeskRunDto }) {
  const { trail } = run;
  const running = run.status === 'running';
  return <div className="space-y-4 text-[12px]">
    <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {running ? <span className="font-display ai-text text-[2rem] font-semibold leading-none">Working…</span> : <>
        <span aria-label="Decision action" className={`font-display text-[2rem] font-semibold leading-none ${actionTone(run.decision.action)}`}>{run.decision.action}</span>
        <span className="num">{percent(run.decision.confidence)} confidence</span></>}
      <span>as of {time(run.asOf)}</span>
      {!run.live && <span className="rounded bg-muted px-1.5 text-[11px]">time machine</span>}
      <span className="text-muted-foreground">{run.symbol} · {run.tokens} tokens · {run.calls} calls</span>
    </header>
    {run.status === 'budget' && <p role="alert" className="text-down">This run was stopped by the token budget, so the answer below may be incomplete.</p>}
    {run.status === 'error' && <p role="alert" className="text-down">The run failed: {run.error ?? 'unknown error'}</p>}
    {running ? <Progress run={run} /> : <Decision run={run} />}
    <RoleCards reports={trail.reports} running={running} />
    <section aria-label="Debate" className="border bg-panel p-4"><h4 className="mb-2 font-semibold">Bull vs bear debate</h4><Debate debate={trail.debate} running={running} /></section>
    <section aria-label="Trader and risk" className="space-y-1.5 border bg-panel p-4">
      <h4 className="font-semibold">Trader proposal</h4>
      {trail.proposal ? <p>{trail.proposal.action} at {price(trail.proposal.entry)}, stop {price(trail.proposal.stopLoss)}, target {price(trail.proposal.target)}: {trail.proposal.rationale}</p>
        : <p className="text-muted-foreground">{running ? 'Waiting for the debate…' : 'No proposal: the run stopped before the trader.'}</p>}
      <h4 className="font-semibold">Risk review</h4>
      {trail.riskReview ? <p>{trail.riskReview.approve ? 'Approved' : 'Rejected'}{trail.riskReview.reasons.length > 0 && `: ${trail.riskReview.reasons.join('; ')}`}</p>
        : <p className="text-muted-foreground">{running ? 'Waiting for the trader…' : 'No risk review.'}</p>}
      <p>Code gate: <span className={trail.gate.pass ? 'text-up' : 'text-down'}>{trail.gate.pass ? 'pass' : 'blocked'}</span>{trail.gate.blocks.length > 0 && ` (${trail.gate.blocks.join('; ')})`}</p>
    </section>
  </div>;
}
