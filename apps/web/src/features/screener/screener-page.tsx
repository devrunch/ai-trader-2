import { useState } from 'react';
import type { SavedScreen, ScreenSpec } from '@aitrader/contracts';
import { draftSpec } from '../../shared/backtest-dsl';
import { Button } from '../../shared/ui/button';
import { Skeleton } from '../../shared/ui/skeleton';
import { SavedScreens } from './saved-screens';
import { ScanResults } from './scan-results';
import { ScreenFormFields } from './screener-form';
import { emptyForm, fromSpec, toSpec, type ScreenForm } from './screener-builder';
import { usePresets, useSavedScreens, useScan, useScreenActions, useUniverses } from './use-screener';

/** Editing state: a simple form, or (for specs the form cannot show) the spec as read-only JSON. */
interface Draft { form: ScreenForm | null; advanced: ScreenSpec | null }
const specOf = (d: Draft) => draftSpec(d.form, d.advanced, toSpec);
const draftOf = (spec: ScreenSpec): Draft => ({ form: fromSpec(spec), advanced: spec });
export function ScreenerPage({ onOpen }: { onOpen: (symbol: string, interval: ScreenSpec['interval']) => void }) {
  const universes = useUniverses();
  const presets = usePresets();
  const saved = useSavedScreens();
  const actions = useScreenActions();
  const scan = useScan();
  const [draft, setDraft] = useState<Draft>({ form: emptyForm(), advanced: null });
  const [name, setName] = useState('My screen');
  const [problem, setProblem] = useState<string | null>(null);

  const withSpec = (then: (spec: ScreenSpec) => void) => {
    const built = specOf(draft);
    if ('error' in built) { setProblem(built.error); return; }
    setProblem(null);
    then(built.spec);
  };
  const load = (s: SavedScreen) => { setDraft(draftOf(s.spec)); setName(s.name); setProblem(null); scan.reset(); };
  const error = problem ?? scan.error?.message ?? actions.create.error?.message ?? null;

  return <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto md:grid-cols-[18rem_minmax(0,1fr)]">
    <SavedScreens list={saved} actions={actions} onLoad={load} />
    <section className="min-w-0 space-y-4 p-3">
      {draft.form
        ? <ScreenFormFields form={draft.form} universes={universes.data?.items ?? []} presets={presets.data?.items ?? []}
          onChange={patch => { setDraft(d => (d.form ? { ...d, form: { ...d.form, ...patch } } : d)); }} />
        : <div className="text-[12px]"><p className="mb-1 text-muted-foreground">This screen uses nested rules or a mix the simple form cannot show. It can be run and saved as is.</p>
          <pre aria-label="Advanced JSON" className="max-h-80 overflow-auto rounded border p-2 text-[11px]">{JSON.stringify(draft.advanced, null, 2)}</pre>
          <Button size="xs" variant="outline" className="mt-1" onClick={() => { setDraft({ form: emptyForm(), advanced: null }); scan.reset(); }}>Start a new screen</Button></div>}
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <Button size="sm" disabled={scan.isPending} onClick={() => { withSpec(spec => { scan.mutate(spec); }); }}>Run</Button>
        <input aria-label="Screen name" className="h-7 rounded border bg-background px-1.5" value={name} onChange={e => { setName(e.target.value); }} />
        <Button size="sm" variant="outline" disabled={actions.create.isPending} onClick={() => { withSpec(spec => { actions.create.mutate({ name, spec }); }); }}>Save this screen</Button>
      </div>
      {error && <p role="alert" className="text-[12px] text-down">{error}</p>}
      {scan.isPending && <Skeleton className="h-40" />}
      {scan.data && <ScanResults result={scan.data} refreshing={scan.isPending} onOpen={symbol => { onOpen(symbol, scan.data.interval); }} />}
      {!scan.data && !scan.isPending && <p className="text-[12px] text-muted-foreground">Pick a universe and a screen, then Run.</p>}
    </section>
  </div>;
}
