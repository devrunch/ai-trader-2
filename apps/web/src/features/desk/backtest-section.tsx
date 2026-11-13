import { useState } from 'react';
import type { DeskBacktestDto, DeskBacktestRequest } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';
import { AiButton } from '../../shared/ui/ai-button';
import { Skeleton } from '../../shared/ui/skeleton';
import { generateDates } from './desk-dates';
import { price, time, tone } from './desk-format';
import { box } from './run-panel';
import { useBacktestActions, useDeskBacktest, useDeskBacktests } from './use-desk';

const fixed = (v: number | null, digits = 2): string => (v === null ? '—' : v.toFixed(digits));

function Results({ bt }: { bt: DeskBacktestDto }) {
  const s = bt.summary;
  return <div className="space-y-2">
    {bt.status === 'running' && <div role="progressbar" aria-valuemin={0} aria-valuemax={bt.progress.total} aria-valuenow={bt.progress.done} aria-label="Backtest progress">
      <div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${String(bt.progress.total === 0 ? 0 : Math.round((bt.progress.done / bt.progress.total) * 100))}%` }} /></div>
      <p className="text-muted-foreground">{bt.progress.done} of {bt.progress.total} dates done</p></div>}
    {bt.status === 'failed' && <p role="alert" className="text-down">The backtest failed: {bt.error ?? 'unknown error'}</p>}
    {s && <dl aria-label="Summary" className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 sm:max-w-xs">
      <dt>Trades</dt><dd className="num">{s.trades}</dd><dt>Holds</dt><dd className="num">{s.holds}</dd>
      <dt>Hit rate</dt><dd className="num">{s.hitRatePct === null ? '—' : `${s.hitRatePct.toFixed(1)}%`}</dd>
      <dt>Average R</dt><dd className={`num ${tone(s.avgR)}`}>{fixed(s.avgR)}</dd>
      <dt>Total R</dt><dd className={`num ${tone(s.totalR)}`}>{fixed(s.totalR)}</dd>
      <dt>Max drawdown (R)</dt><dd className="num">{fixed(s.maxDrawdownR)}</dd></dl>}
    {bt.items.length === 0 ? (bt.status !== 'running' && <p className="text-muted-foreground">No scored dates.</p>)
      : <table aria-label="Backtest results" className="w-full text-left">
        <thead className="text-[11px] text-muted-foreground"><tr><th>Date</th><th>Action</th><th>Entry</th><th>Stop</th><th>Target</th><th>Outcome</th><th>R</th></tr></thead>
        <tbody>{bt.items.map(i => <tr key={i.asOf} className="border-t"><td>{i.asOf.slice(0, 10)}</td><td>{i.action}</td>
          <td className="num">{price(i.entry)}</td><td className="num">{price(i.stopLoss)}</td><td className="num">{price(i.target)}</td>
          <td>{i.outcome}</td><td className={`num ${tone(i.r)}`}>{fixed(i.r)}</td></tr>)}</tbody></table>}
    <p className="text-[11px] text-muted-foreground">This scores the desk&apos;s decisions against what happened afterwards. Fills are pessimistic (the stop wins a tie) and there are no costs.</p>
  </div>;
}

export function BacktestSection({ symbol }: { symbol: string }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [step, setStep] = useState(7);
  const [rounds, setRounds] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const { estimate, start: launch } = useBacktestActions();
  const bt = useDeskBacktest(openId);
  const past = useDeskBacktests(symbol);
  const generated = generateDates(start, end, step);
  const request = (): DeskBacktestRequest | null => (generated.error === null ? { symbol, dates: generated.dates, rounds, interval: '5', horizonBars: 75 } : null);
  const change = (apply: () => void) => { apply(); estimate.reset(); };
  const onEstimate = () => { const body = request(); if (body) estimate.mutate(body); };
  const onStart = () => { const body = request(); if (body) launch.mutate(body, { onSuccess: created => { setOpenId(created.id); } }); };
  const est = estimate.data;
  const shownError = start !== '' && end !== '' ? generated.error : null;
  return <section aria-label="Desk backtest" className="space-y-2 text-[12px]">
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1">Start date <input aria-label="Start date" type="date" className={box} value={start} onChange={e => { change(() => { setStart(e.target.value); }); }} /></label>
      <label className="flex items-center gap-1">End date <input aria-label="End date" type="date" className={box} value={end} onChange={e => { change(() => { setEnd(e.target.value); }); }} /></label>
      <label className="flex items-center gap-1">Every <input aria-label="Step in days" type="number" min={1} className={`${box} w-14`} value={step} onChange={e => { change(() => { setStep(Number(e.target.value)); }); }} /> days</label>
      <label className="flex items-center gap-1">Rounds <select aria-label="Backtest rounds" className={box} value={rounds} onChange={e => { change(() => { setRounds(e.target.value === '2' ? 2 : 1); }); }}>
        <option value="1">1</option><option value="2">2</option></select></label>
      <span className="num text-muted-foreground">{generated.count} dates</span>
    </div>
    {shownError && <p role="alert" className="text-down">{shownError}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <Button size="xs" variant="outline" disabled={generated.error !== null || estimate.isPending} onClick={onEstimate}>Estimate cost</Button>
      <AiButton size="sm" disabled={!est || launch.isPending} onClick={onStart}>Start backtest</AiButton>
      {est && <span>{est.runs} runs, ~{est.calls} model calls, ~{est.tokensEstimate} tokens (daily runs left: {est.dailyRunsLeft})</span>}
    </div>
    {estimate.isError && <p role="alert" className="text-down">{estimate.error.message}</p>}
    {launch.isError && <p role="alert" className="text-down">{launch.error.message}</p>}
    {openId !== null && (bt.isPending ? <Skeleton className="h-24" /> : bt.isError ? <p role="alert" className="text-down">Backtest unavailable. {bt.error.message}</p>
      : <div className={bt.isFetching && bt.data.status !== 'running' ? 'opacity-70' : ''}><Results bt={bt.data} /></div>)}
    <h4 className="font-semibold">Past backtests</h4>
    {past.isPending ? <Skeleton className="h-8" /> : past.isError ? <p role="alert" className="text-down">Past backtests are unavailable right now. {past.error.message}</p>
      : past.data.items.length === 0 ? <p className="text-muted-foreground">No backtests yet for this symbol.</p>
      : <ul>{past.data.items.map(b => <li key={b.id} className="border-t"><button type="button" className="flex w-full gap-x-3 py-1 text-left hover:underline" onClick={() => { setOpenId(b.id); }}>
        <span>{time(b.createdAt)}</span><span>{b.status}</span><span className="num text-muted-foreground">{b.progress.done}/{b.progress.total} dates</span>
        <span className={`num ${tone(b.summary?.totalR ?? null)}`}>{b.summary ? `${fixed(b.summary.totalR)} R` : ''}</span></button></li>)}</ul>}
  </section>;
}
