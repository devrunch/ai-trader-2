import { useState } from 'react';
import { Pencil, Settings2, X } from 'lucide-react';
import type { IndicatorDefinition, IndicatorResult } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';
import { usePineDialog } from './pine/pine-dialog-store';
import { IndicatorSettingsDialog } from './indicator-settings-dialog';
import { inputSummary } from './input-draft';
import { defaultPresentation, formatValue, sameJson, type Presentation } from './style';
import { indicatorLabel, parentKeyOf, sourceOptions } from './source-refs';
import { useIndicatorStore, type InputValues } from './state/indicator-store';
import type { IndicatorRow } from './use-chart-indicators';

/** Legend over the chart (FR-IN-15): name, inputs, newest values, settings and remove. Adding lives in the toolbar. */
export function IndicatorLegend({ rows }: { rows: IndicatorRow[] }) {
  const { update, remove, setPresentation } = useIndicatorStore();
  const [editing, setEditing] = useState<string | null>(null);
  const openPine = usePineDialog(state => state.open);
  const open = rows.find(row => row.item.key === editing);
  // Settings equal to the defaults are stored as none, so the built-in's look stays the single source.
  const savePresentation = (key: string, definition: IndicatorDefinition, presentation: Presentation) => { setPresentation(key, sameJson(presentation, defaultPresentation(definition)) ? undefined : presentation); };
  const editingDefinition = open?.definition;
  const items = rows.map(row => row.item);
  const definitions = rows.flatMap(row => (row.definition ? [row.definition] : []));
  const nameOf = (key: string) => { const row = rows.find(r => r.item.key === key); return row ? indicatorLabel(row.definition, row.item) : 'unavailable'; };
  return <div className="pointer-events-auto flex flex-col items-start gap-1 text-xs">
    {rows.map(row => <div key={row.item.key} className="group flex h-6 items-center gap-2 rounded px-1.5 hover:bg-panel/90" data-testid="indicator-legend-row">
      <span className="font-medium">{row.definition?.shortName ?? row.item.id}</span>
      {row.definition && <span className="text-muted-foreground">{inputSummary(row.definition.inputs, row.item.inputs, nameOf)}</span>}
      {row.error ? <span role="alert" className="text-destructive">{row.error}</span>
        : row.hidden ? <span className="text-muted-foreground">hidden on this interval</span>
        : row.loading ? <span className="text-muted-foreground">loading</span> : <span className="num">{latestValues(row.result, row.presentation?.style.precision ?? null)}</span>}
      {row.result?.reason && !row.error && <span className="max-w-64 truncate text-muted-foreground" title={row.result.reason} data-testid="indicator-reason">{row.result.reason}</span>}
      {row.item.pine && <Button size="icon-xs" variant="ghost" aria-label={`Edit ${row.definition?.shortName ?? row.item.id}`}
        onClick={() => { if (row.item.pine) openPine({ tab: 'editor', source: row.item.pine.source, key: row.item.key }); }}><Pencil /></Button>}
      <Button size="icon-xs" variant="ghost" aria-label={`Settings for ${row.definition?.shortName ?? row.item.id}`} disabled={!row.definition}
        onClick={() => { setEditing(row.item.key); }}><Settings2 /></Button>
      <Button size="icon-xs" variant="ghost" aria-label={`Remove ${row.definition?.shortName ?? row.item.id}`} onClick={() => { remove(row.item.key); }}><X /></Button>
    </div>)}
    {open && editingDefinition && <IndicatorSettingsDialog definition={editingDefinition} inputs={open.item.inputs} presentation={open.presentation ?? defaultPresentation(editingDefinition)}
      chained={parentKeyOf(open.item) !== undefined} sources={open.item.pine ? [] : sourceOptions(items, open.item, definitions)}
      onApply={(values, presentation) => { if (inputsChanged(editingDefinition, open.item.inputs, values)) update(open.item.key, values); savePresentation(open.item.key, editingDefinition, presentation); }} onClose={() => { setEditing(null); }} />}
  </div>;
}

function latestValues(result: IndicatorResult | undefined, precision: number | null): string {
  if (!result) return '';
  return result.plots.map(plot => plot.values.findLast((value): value is number => value !== null))
    .flatMap(value => (value === undefined ? [] : [formatValue(value, precision)])).join(' ');
}

/** Applying only a style must not rewrite the inputs, or the query key changes and the chart refetches. */
function inputsChanged(definition: IndicatorDefinition, current: InputValues, next: InputValues): boolean {
  return !sameJson(Object.fromEntries(definition.inputs.map(def => [def.id, current[def.id] ?? def.default])), next);
}
