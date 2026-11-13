import { useState } from 'react';
import type { DeskRunDto } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';
import { AiButton } from '../../shared/ui/ai-button';
import { Field, Panel, fieldClass } from '../../shared/ui/page';
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
  return <section aria-label="Desk run" className="grid gap-4 lg:grid-cols-[20rem_1fr]">
    <div className="space-y-4">
      <Panel title="Run the desk">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Symbol" className="col-span-2"><input aria-label="Symbol" className={fieldClass} value={symbol} onChange={e => { onSymbol(e.target.value); }} /></Field>
          <Field label="Debate rounds"><select aria-label="Rounds" className={fieldClass} value={rounds} onChange={e => { setRounds(e.target.value === '2' ? 2 : 1); }}>
            <option value="1">1</option><option value="2">2</option></select></Field>
          <div className="flex items-end"><AiButton className="w-full" disabled={run.isPending} onClick={() => { start(undefined); }}>Run now</AiButton></div>
          <Field label="Replay as of (time machine)" className="col-span-2"><input aria-label="As of" type="datetime-local" className={fieldClass} max={nowLocal()} value={asOf} onChange={e => { setAsOf(e.target.value); }} /></Field>
          <Button variant="outline" className="col-span-2 h-9 rounded-none" disabled={run.isPending} onClick={onAsOf}>Run as of</Button>
        </div>
        {problem && <p role="alert" className="mt-3 text-down">{problem}</p>}
        {run.isError && <p role="alert" className="mt-3 text-down">{run.error.message}</p>}
      </Panel>
      <Panel title={`Past runs for ${symbol}`} bodyClassName="p-0">
        {runs.isPending ? <div className="p-4"><Skeleton className="h-8" /></div>
          : runs.isError ? <p role="alert" className="p-4 text-down">Past runs are unavailable right now. {runs.error.message}</p>
          : items.length === 0 ? <p className="p-4 text-muted-foreground">No runs yet for this symbol.</p>
          : <ul className={runs.isFetching ? 'opacity-70' : ''}>{items.map(r => <li key={r.id} className="border-t first:border-t-0">
            <button type="button" className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 px-4 py-2 text-left text-[12px] hover:bg-muted ${shown?.id === r.id ? 'bg-muted' : ''}`} onClick={() => { setShown(r); }}>
              <span className={`w-11 font-semibold ${actionTone(r.decision.action)}`}>{r.decision.action}</span>
              <span className="min-w-0"><span className="block truncate">{time(r.createdAt)}</span><span className="block truncate text-[11px] text-muted-foreground">as of {time(r.asOf)}</span></span>
              <span className="num text-right"><span className="block">{percent(r.decision.confidence)}</span><span className="block text-[11px] text-muted-foreground">{r.tokens} tokens</span></span>
            </button></li>)}</ul>}
      </Panel>
    </div>
    <div className="min-w-0">
      {run.isPending && <Panel ai title="The desk is working"><div role="status" className="space-y-2"><p className="text-muted-foreground">Analysts, debate, trader and risk review. This can take up to a minute.</p><Skeleton className="h-40" /></div></Panel>}
      {!run.isPending && shown && <RunView run={shown} />}
      {!run.isPending && !shown && <div className="grid h-full min-h-60 place-items-center border border-dashed p-8 text-center text-[13px] text-muted-foreground">
        <p className="max-w-sm">No run open. Run the desk now, replay a past moment, or open an earlier run from the list.</p></div>}
    </div>
  </section>;
}
