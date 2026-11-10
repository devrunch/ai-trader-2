import { useState } from 'react';
import type { IndicatorDefinition, IndicatorResult } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';
import { IndicatorSettingsDialog } from './indicator-settings-dialog';
import { inputSummary } from './input-draft';
import { useIndicatorStore } from './state/indicator-store';
import type { IndicatorRow } from './use-chart-indicators';

/** Legend over the chart (FR-IN-15): name, inputs, newest values, settings and remove; plus the add menu. */
export function IndicatorLegend({ rows, catalog }: { rows: IndicatorRow[]; catalog: IndicatorDefinition[] | undefined }) {
  const { add, update, remove } = useIndicatorStore();
  const [editing, setEditing] = useState<string | null>(null);
  const open = rows.find(row => row.item.key === editing);
  return <div className="pointer-events-auto flex flex-col items-start gap-1 text-xs">
    <select aria-label="Add indicator" className="h-7 rounded-md border bg-panel px-2" value=""
      disabled={!catalog} onChange={event => { if (event.target.value) add(event.target.value); }}>
      <option value="">{catalog ? 'Indicators' : 'Loading indicators…'}</option>
      {catalog?.map(definition => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
    </select>
    {rows.map(row => <div key={row.item.key} className="flex items-center gap-2 rounded bg-panel/80 px-1" data-testid="indicator-legend-row">
      <span className="font-medium">{row.definition?.shortName ?? row.item.id}</span>
      {row.definition && <span className="text-muted-foreground">{inputSummary(row.definition.inputs, row.item.inputs)}</span>}
      {row.error ? <span role="alert" className="text-destructive">{row.error}</span>
        : row.loading ? <span className="text-muted-foreground">loading</span> : <span>{latestValues(row.result)}</span>}
      <Button size="icon-xs" variant="ghost" aria-label={`Settings for ${row.definition?.shortName ?? row.item.id}`} disabled={!row.definition}
        onClick={() => { setEditing(row.item.key); }}>⚙</Button>
      <Button size="icon-xs" variant="ghost" aria-label={`Remove ${row.definition?.shortName ?? row.item.id}`} onClick={() => { remove(row.item.key); }}>✕</Button>
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
