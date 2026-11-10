import { useState } from 'react';
import { Settings2, X } from 'lucide-react';
import type { IndicatorResult } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';
import { IndicatorSettingsDialog } from './indicator-settings-dialog';
import { inputSummary } from './input-draft';
import { useIndicatorStore } from './state/indicator-store';
import type { IndicatorRow } from './use-chart-indicators';

/** Legend over the chart (FR-IN-15): name, inputs, newest values, settings and remove. Adding lives in the toolbar. */
export function IndicatorLegend({ rows }: { rows: IndicatorRow[] }) {
  const { update, remove } = useIndicatorStore();
  const [editing, setEditing] = useState<string | null>(null);
  const open = rows.find(row => row.item.key === editing);
  return <div className="pointer-events-auto flex flex-col items-start gap-1 text-xs">
    {rows.map(row => <div key={row.item.key} className="group flex h-6 items-center gap-2 rounded px-1.5 hover:bg-panel/90" data-testid="indicator-legend-row">
      <span className="font-medium">{row.definition?.shortName ?? row.item.id}</span>
      {row.definition && <span className="text-muted-foreground">{inputSummary(row.definition.inputs, row.item.inputs)}</span>}
      {row.error ? <span role="alert" className="text-destructive">{row.error}</span>
        : row.loading ? <span className="text-muted-foreground">loading</span> : <span className="num">{latestValues(row.result)}</span>}
      <Button size="icon-xs" variant="ghost" aria-label={`Settings for ${row.definition?.shortName ?? row.item.id}`} disabled={!row.definition}
        onClick={() => { setEditing(row.item.key); }}><Settings2 /></Button>
      <Button size="icon-xs" variant="ghost" aria-label={`Remove ${row.definition?.shortName ?? row.item.id}`} onClick={() => { remove(row.item.key); }}><X /></Button>
    </div>)}
    {open?.definition && <IndicatorSettingsDialog definition={open.definition} inputs={open.item.inputs}
      onApply={values => { update(open.item.key, values); }} onClose={() => { setEditing(null); }} />}
  </div>;
}

function latestValues(result: IndicatorResult | undefined): string {
  if (!result) return '';
  return result.plots.map(plot => plot.values.findLast((value): value is number => value !== null))
    .flatMap(value => (value === undefined ? [] : [value.toFixed(2)])).join(' ');
}
