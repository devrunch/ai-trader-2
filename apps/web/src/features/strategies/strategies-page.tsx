import { useState } from 'react';
import type { StrategyDto } from '@aitrader/contracts';
import { FlaskIcon } from '@phosphor-icons/react';
import { Button } from '../../shared/ui/button';
import { Page, PageHeader, Panel } from '../../shared/ui/page';
import { Skeleton } from '../../shared/ui/skeleton';
import { BacktestResults } from './backtest-results';
import { STARTERS, emptyForm, fromSpec } from './strategy-builder';
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

  return <Page>
    <PageHeader icon={FlaskIcon} title="Strategies"
      description="Write entry and exit rules, backtest them on real bars with costs, and compare in-sample with out-of-sample results. Every changed run counts as a variant: the more you try, the more likely a good result is luck." />
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
    <aside aria-label="Saved strategies" className="self-start border bg-panel text-sm">
      <div className="flex min-h-11 items-center justify-between border-b px-4"><h2 className="text-base font-semibold">Saved</h2>
        <Button size="xs" variant="outline" onClick={() => { setDraft(blank()); setProblem(null); run.reset(); }}>New</Button></div>
      <div className="p-3">
      {list.isPending ? <div className="space-y-1"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
        : list.isError ? <p role="alert" className="text-down">Strategies are unavailable right now. {list.error.message}</p>
        : items.length === 0 ? <p className="text-muted-foreground">No saved strategies yet. Pick a template or write rules, run the backtest, then Save.</p>
        : <ul className={list.isFetching ? 'opacity-70' : ''}>{items.map(s => <li key={s.id} className="flex items-center gap-1 border-b py-1">
          <button type="button" className="min-w-0 flex-1 text-left hover:underline" onClick={() => { setDraft(draftOf(s)); setProblem(null); run.reset(); }}>
            <span className="block truncate font-semibold">{s.name}</span>
            <span className="text-xs text-muted-foreground">{s.spec.symbol} · {s.spec.interval} · {s.variants} variants tried</span></button>
          <Button size="xs" variant="ghost" aria-label={`Delete ${s.name}`} disabled={remove.isPending} onClick={() => { onDelete(s.id); }}>×</Button>
        </li>)}</ul>}
      {remove.isError && <p role="alert" className="mt-1 text-down">{remove.error.message}</p>}
      </div>
    </aside>
    <section className="min-w-0 space-y-4">
      {draft.id === null && <Panel title="Start from a template">
        <ul className="grid gap-2 sm:grid-cols-2">{STARTERS.map(t => <li key={t.name}>
          <button type="button" className="h-full w-full border p-3 text-left hover:border-link hover:bg-muted"
            onClick={() => { setDraft({ id: null, name: t.name, form: t.form(), advanced: null }); setProblem(null); run.reset(); }}>
            <span className="block font-semibold">{t.name}</span><span className="mt-1 block text-sm text-muted-foreground">{t.summary}</span>
          </button></li>)}</ul>
        <p className="mt-3 text-sm text-muted-foreground">Templates are starting points to learn from, not recommendations. Change the symbol and rules, then run the backtest.</p>
      </Panel>}
      <Panel title="Rules">
      <StrategyEditor draft={draft} onChange={setDraft} onSave={onSave} onRun={onRun} busy={run.isPending || save.isPending}
        error={problem ?? message(save.error) ?? message(run.error)} />
      </Panel>
      {run.isPending && <Skeleton className="h-40" />}
      {run.data && <Panel title="Backtest result"><BacktestResults result={run.data.result} variants={run.data.variants} /></Panel>}
    </section>
    </div>
  </Page>;
}
