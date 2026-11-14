import { useState } from 'react';
import type { SavedScreen, ScreenSpec } from '@aitrader/contracts';
import { draftSpec } from '../../shared/backtest-dsl';
import { FunnelIcon } from '@phosphor-icons/react';
import { Button } from '../../shared/ui/button';
import { Page, PageHeader, Panel, fieldClass } from '../../shared/ui/page';
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

  return <Page>
    <PageHeader icon={FunnelIcon} title="Screener"
      description="Scan a whole market at once: NIFTY 50/100/500, forex, commodities, US stocks or your watchlist. Pick a ready-made screen or write conditions, add company fundamentals for Indian stocks, and Run. Click a result to open its chart." />
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
    <div className="self-start border bg-panel"><SavedScreens list={saved} actions={actions} onLoad={load} /></div>
    <section className="min-w-0 space-y-4">
      <Panel title="What to scan">
      {draft.form
        ? <ScreenFormFields form={draft.form} universes={universes.data?.items ?? []} presets={presets.data?.items ?? []}
          onChange={patch => { setDraft(d => (d.form ? { ...d, form: { ...d.form, ...patch } } : d)); }} />
        : <div className="text-sm"><p className="mb-1 text-muted-foreground">This screen uses nested rules or a mix the simple form cannot show. It can be run and saved as is.</p>
          <pre aria-label="Advanced JSON" className="max-h-80 overflow-auto rounded border p-2 text-xs">{JSON.stringify(draft.advanced, null, 2)}</pre>
          <Button size="xs" variant="outline" className="mt-1" onClick={() => { setDraft({ form: emptyForm(), advanced: null }); scan.reset(); }}>Start a new screen</Button></div>}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
        <Button className="h-9 rounded-none px-5" disabled={scan.isPending} onClick={() => { withSpec(spec => { scan.mutate(spec); }); }}>{scan.isPending ? 'Scanning…' : 'Run'}</Button>
        <input aria-label="Screen name" className={`${fieldClass} !w-48`} value={name} onChange={e => { setName(e.target.value); }} />
        <Button variant="outline" className="h-9 rounded-none" disabled={actions.create.isPending} onClick={() => { withSpec(spec => { actions.create.mutate({ name, spec }); }); }}>Save this screen</Button>
      </div>
      </Panel>
      {error && <p role="alert" className="text-sm text-down">{error}</p>}
      {scan.isPending && <Skeleton className="h-40" />}
      {scan.data && <Panel title="Results" bodyClassName="p-0"><ScanResults result={scan.data} refreshing={scan.isPending} onOpen={symbol => { onOpen(symbol, scan.data.interval); }} /></Panel>}
      {!scan.data && !scan.isPending && <div className="border border-dashed p-6 text-center text-base text-muted-foreground">Pick a universe and a screen above, then Run. Results show each match with its values and a sparkline.</div>}
    </section>
    </div>
  </Page>;
}
