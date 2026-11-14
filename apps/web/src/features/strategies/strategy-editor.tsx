import type { BacktestSpec } from '@aitrader/contracts';
import { draftSpec as sharedDraftSpec } from '../../shared/backtest-dsl';
import { Button } from '../../shared/ui/button';
import { StrategyFormFields } from './strategy-form';
import { toSpec, type StrategyForm } from './strategy-builder';

/** Editing state: a simple form, or (for specs the form cannot show) the spec as read-only JSON. */
export interface Draft { id: string | null; name: string; form: StrategyForm | null; advanced: BacktestSpec | null }

export const draftSpec = (d: Draft): { spec: BacktestSpec } | { error: string } => sharedDraftSpec(d.form, d.advanced, toSpec);

export function StrategyEditor({ draft, onChange, onSave, onRun, busy, error }: { draft: Draft; onChange: (d: Draft) => void; onSave: () => void; onRun: () => void; busy: boolean; error: string | null }) {
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-1">Name <input aria-label="Name" className="h-7 rounded border bg-background px-1.5" value={draft.name} onChange={e => { onChange({ ...draft, name: e.target.value }); }} /></label>
      <Button size="sm" variant="outline" disabled={busy} onClick={onSave}>Save</Button>
      <Button size="sm" disabled={busy} onClick={onRun}>Run</Button>
    </div>
    {error && <p role="alert" className="text-sm text-down">{error}</p>}
    {draft.form ? <StrategyFormFields form={draft.form} onChange={form => { onChange({ ...draft, form }); }} />
      : <div className="text-sm"><p className="mb-1 text-muted-foreground">This strategy uses nested rules the simple form cannot show. It can be run as is.</p>
        <pre aria-label="Advanced JSON" className="max-h-80 overflow-auto rounded border p-2 text-xs">{JSON.stringify(draft.advanced, null, 2)}</pre></div>}
  </div>;
}
