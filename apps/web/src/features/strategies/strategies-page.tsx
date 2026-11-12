import { useState } from 'react';
import type { StrategyDto } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';
import { Skeleton } from '../../shared/ui/skeleton';
import { BacktestResults } from './backtest-results';
import { emptyForm, fromSpec } from './strategy-builder';
import { draftSpec, StrategyEditor, type Draft } from './strategy-editor';
import { useStrategies, useStrategyActions } from './use-strategies';

const blank = (): Draft => ({ id: null, name: 'New strategy', form: emptyForm(), advanced: null });
const draftOf = (s: StrategyDto): Draft => ({ id: s.id, name: s.name, form: fromSpec(s.spec), advanced: s.spec });
const message = (error: Error | null): string | null => (error ? error.message : null);

export function StrategiesPage() {
  const list = useStrategies();
  const { save, remove, run } = useStrategyActions();
  const [draft, setDraft] = useState<Draft>(blank);
  const [problem, setProblem] = useState<string | null>(null);
  const items = list.data?.items ?? [];

  const onSave = () => {
    const built = draftSpec(draft);
    if ('error' in built) { setProblem(built.error); return; }
    setProblem(null);
    save.mutate({ id: draft.id, name: draft.name, spec: built.spec }, { onSuccess: saved => { setDraft(d => ({ ...d, id: saved.id })); } });
  };
  const onRun = () => {
    const built = draftSpec(draft);
    if ('error' in built) { setProblem(built.error); return; }
    setProblem(null);
    run.mutate({ strategyId: draft.id, spec: built.spec });
  };
  const onDelete = (id: string) => { remove.mutate(id, { onSuccess: () => { if (draft.id === id) setDraft(blank()); } }); };

  return <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto md:grid-cols-[18rem_minmax(0,1fr)]">
    <aside aria-label="Saved strategies" className="border-b p-3 text-[12px] md:border-b-0 md:border-r">
      <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Strategies</h2>
        <Button size="xs" variant="outline" onClick={() => { setDraft(blank()); setProblem(null); run.reset(); }}>New</Button></div>
      {list.isPending ? <div className="space-y-1"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
        : list.isError ? <p role="alert" className="text-down">Strategies are unavailable right now. {list.error.message}</p>
        : items.length === 0 ? <p className="text-muted-foreground">No strategies yet: build one on the right.</p>
        : <ul className={list.isFetching ? 'opacity-70' : ''}>{items.map(s => <li key={s.id} className="flex items-center gap-1 border-b py-1">
          <button type="button" className="min-w-0 flex-1 text-left hover:underline" onClick={() => { setDraft(draftOf(s)); setProblem(null); run.reset(); }}>
            <span className="block truncate font-semibold">{s.name}</span>
            <span className="text-[11px] text-muted-foreground">{s.spec.symbol} · {s.spec.interval} · {s.variants} variants tried</span></button>
          <Button size="xs" variant="ghost" aria-label={`Delete ${s.name}`} disabled={remove.isPending} onClick={() => { onDelete(s.id); }}>×</Button>
        </li>)}</ul>}
      {remove.isError && <p role="alert" className="mt-1 text-down">{remove.error.message}</p>}
    </aside>
    <section className="min-w-0 space-y-4 p-3">
      <StrategyEditor draft={draft} onChange={setDraft} onSave={onSave} onRun={onRun} busy={run.isPending || save.isPending}
        error={problem ?? message(save.error) ?? message(run.error)} />
      {run.isPending && <Skeleton className="h-40" />}
      {run.data && <BacktestResults result={run.data.result} variants={run.data.variants} />}
    </section>
  </div>;
}
