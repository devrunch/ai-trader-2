import { useQueryClient } from '@tanstack/react-query';
import { XIcon } from '@phosphor-icons/react';
import { useEffect } from 'react';
import { Panel } from '../../shared/ui/page';
import { Skeleton } from '../../shared/ui/skeleton';
import { BacktestSection } from './backtest-section';
import { RunView } from './run-view';
import { useDeskRun } from './use-desk';

/** One AI Desk run inside the agent window: every role's report, the debate and the decision, then scoring the desk on past days for the same symbol. */
export function DeskRunPane({ runId, onClose }: { runId: string; onClose: () => void }) {
  const opened = useDeskRun(runId);
  const run = opened.data ?? null;
  const client = useQueryClient();
  const finished = run !== null && run.status !== 'running';
  useEffect(() => { if (finished) void client.invalidateQueries({ queryKey: ['desk', 'runs'] }); }, [finished, client]);
  return <div className="relative space-y-4">
    <button type="button" aria-label="Close" onClick={onClose} className="absolute right-0 top-0 z-10 grid size-8 place-items-center border bg-panel hover:bg-muted">
      <XIcon className="size-4" aria-hidden="true" /></button>
    {opened.isPending && <Panel ai title="AI Desk"><Skeleton className="h-40" /></Panel>}
    {opened.isError && <p role="alert" className="border p-4 text-down">This run could not be loaded. {opened.error.message}</p>}
    {run && <RunView run={run} />}
    {run && <Panel title={`Score the desk on past days: ${run.symbol}`}>
      <p className="mb-3 text-muted-foreground">Replay the desk on up to 30 past dates and check its calls against what the price did next: hit rate, average R and drawdown. Each date uses one desk run.</p>
      <BacktestSection symbol={run.symbol} />
    </Panel>}
  </div>;
}
