import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../shared/ui/button';
import { AiButton } from '../../shared/ui/ai-button';
import { Field, Panel, fieldClass } from '../../shared/ui/page';
import { Skeleton } from '../../shared/ui/skeleton';
import { toOffsetIso } from './desk-dates';
import { actionTone, percent, time } from './desk-format';
import { RunView } from './run-view';
import { useDeskRun, useDeskRuns, useRunDesk } from './use-desk';

export const box = 'h-7 min-w-0 rounded border bg-background px-1.5';

/** Local "now" as a datetime-local value, used as the picker's upper bound. */
const nowLocal = (): string => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); };

export function RunPanel({ symbol, runId, onSymbol, onOpenRun }:
  { symbol: string; runId: string | undefined; onSymbol: (symbol: string) => void; onOpenRun: (id: string, symbol?: string) => void }) {
  const [rounds, setRounds] = useState(1);
  const [asOf, setAsOf] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const runs = useDeskRuns(symbol);
  const opened = useDeskRun(runId);
  const shown = opened.data ?? null;
  const client = useQueryClient();
  const finished = shown !== null && shown.status !== 'running';
  // When the open run finishes, refresh the run lists and the header pill at once.
  useEffect(() => { if (finished) void client.invalidateQueries({ queryKey: ['desk', 'runs'] }); }, [finished, client]);
  const run = useRunDesk();
  const start = (iso: string | undefined) => { setProblem(null); run.mutate({ symbol, rounds, ...(iso ? { asOf: iso } : {}) }, { onSuccess: started => { onOpenRun(started.id, started.symbol); } }); };
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
            <button type="button" className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 px-4 py-2 text-left text-[12px] hover:bg-muted ${shown?.id === r.id ? 'bg-muted' : ''}`} onClick={() => { onOpenRun(r.id, r.symbol); }}>
              <span className={`w-14 font-semibold ${r.status === 'running' ? 'ai-text' : actionTone(r.decision.action)}`}>{r.status === 'running' ? 'Working' : r.decision.action}</span>
              <span className="min-w-0"><span className="block truncate">{time(r.createdAt)}</span><span className="block truncate text-[11px] text-muted-foreground">as of {time(r.asOf)}</span></span>
              <span className="num text-right"><span className="block">{percent(r.decision.confidence)}</span><span className="block text-[11px] text-muted-foreground">{r.tokens} tokens</span></span>
            </button></li>)}</ul>}
      </Panel>
    </div>
    <div className="min-w-0">
      {(run.isPending || (runId !== undefined && opened.isPending)) && <Panel ai title="Starting the desk"><Skeleton className="h-40" /></Panel>}
      {opened.isError && <p role="alert" className="border p-4 text-down">This run could not be loaded. {opened.error.message}</p>}
      {shown && <RunView run={shown} />}
      {!run.isPending && runId === undefined && <div className="grid h-full min-h-60 place-items-center border border-dashed p-8 text-center text-[13px]">
        <div className="max-w-sm space-y-3">
          <p className="font-semibold">No run open</p>
          <p className="text-muted-foreground">Ask the desk about {symbol} now, or replay a past moment with the time machine. Past runs are listed on the left.</p>
          <AiButton onClick={() => { start(undefined); }}>Run on {symbol.split(':')[1] ?? symbol} now</AiButton>
        </div></div>}
    </div>
  </section>;
}
