import { useState } from 'react';
import type { DeskRunDto } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';
import { Skeleton } from '../../shared/ui/skeleton';
import { toOffsetIso } from './desk-dates';
import { actionTone, percent, time } from './desk-format';
import { RunView } from './run-view';
import { useDeskRuns, useRunDesk } from './use-desk';

export const box = 'h-7 min-w-0 rounded border bg-background px-1.5';

/** Local "now" as a datetime-local value, used as the picker's upper bound. */
const nowLocal = (): string => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); };

export function RunPanel({ symbol, onSymbol }: { symbol: string; onSymbol: (symbol: string) => void }) {
  const [rounds, setRounds] = useState(1);
  const [asOf, setAsOf] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [shown, setShown] = useState<DeskRunDto | null>(null);
  const runs = useDeskRuns(symbol);
  const run = useRunDesk();
  const start = (iso: string | undefined) => { setProblem(null); run.mutate({ symbol, rounds, ...(iso ? { asOf: iso } : {}) }, { onSuccess: setShown }); };
  const onAsOf = () => {
    const iso = toOffsetIso(asOf);
    if (iso === null) { setProblem('Pick the date and time to replay.'); return; }
    if (asOf > nowLocal()) { setProblem('The as-of time cannot be in the future.'); return; }
    start(iso);
  };
  const items = runs.data?.items ?? [];
  return <section aria-label="Desk run" className="space-y-3">
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <label className="flex items-center gap-1">Symbol <input aria-label="Symbol" className={`${box} w-32`} value={symbol} onChange={e => { onSymbol(e.target.value); }} /></label>
      <label className="flex items-center gap-1">Rounds <select aria-label="Rounds" className={box} value={rounds} onChange={e => { setRounds(e.target.value === '2' ? 2 : 1); }}>
        <option value="1">1</option><option value="2">2</option></select></label>
      <Button size="xs" disabled={run.isPending} onClick={() => { start(undefined); }}>Run now</Button>
      <label className="flex items-center gap-1">As of <input aria-label="As of" type="datetime-local" className={box} max={nowLocal()} value={asOf} onChange={e => { setAsOf(e.target.value); }} /></label>
      <Button size="xs" variant="outline" disabled={run.isPending} onClick={onAsOf}>Run as of</Button>
    </div>
    {problem && <p role="alert" className="text-down">{problem}</p>}
    {run.isError && <p role="alert" className="text-down">{run.error.message}</p>}
    {run.isPending && <div role="status" className="space-y-1 text-[12px]"><p className="text-muted-foreground">The desk is working: analysts, debate, trader and risk review. This can take up to a minute.</p><Skeleton className="h-32" /></div>}
    {!run.isPending && shown && <RunView run={shown} />}
    {!run.isPending && !shown && <p className="text-[12px] text-muted-foreground">No run open: run the desk now or as of a past time, or open an earlier run below.</p>}
    <section aria-label="Past runs" className="text-[12px]">
      <h4 className="mb-1 font-semibold">Past runs for {symbol}</h4>
      {runs.isPending ? <Skeleton className="h-8" />
        : runs.isError ? <p role="alert" className="text-down">Past runs are unavailable right now. {runs.error.message}</p>
        : items.length === 0 ? <p className="text-muted-foreground">No runs yet for this symbol.</p>
        : <ul className={runs.isFetching ? 'opacity-70' : ''}>{items.map(r => <li key={r.id} className="border-t">
          <button type="button" className="flex w-full flex-wrap gap-x-3 py-1 text-left hover:underline" onClick={() => { setShown(r); }}>
            <span>{time(r.createdAt)}</span><span className="text-muted-foreground">as of {time(r.asOf)}</span>
            <span className={`font-semibold ${actionTone(r.decision.action)}`}>{r.decision.action}</span>
            <span className="num">{percent(r.decision.confidence)}</span><span className="num text-muted-foreground">{r.tokens} tokens</span></button></li>)}</ul>}
    </section>
  </section>;
}
