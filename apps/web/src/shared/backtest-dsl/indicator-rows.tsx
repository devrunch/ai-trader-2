import { Button } from '../ui/button';
import { fieldBox } from './condition-rows';
import type { FormIndicatorRow } from './condition-text';

/** Indicator rows (name, id, inputs and, when `withPlot`, the plot) with one-click presets. */
export function IndicatorRows<T extends FormIndicatorRow>({ items, defaults, withPlot = false, onChange }: { items: T[]; defaults: Record<string, T>; withPlot?: boolean; onChange: (items: T[]) => void }) {
  const set = (i: number, patch: Partial<FormIndicatorRow>) => { onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))); };
  return <fieldset className="space-y-1"><legend className="mb-1 font-semibold">Indicators</legend>
    {items.map((x, i) => <div key={i} className="flex flex-wrap items-center gap-1">
      <input aria-label={`Indicator ${String(i + 1)} name`} className={`${fieldBox} w-20`} value={x.name} onChange={e => { set(i, { name: e.target.value }); }} />
      <input aria-label={`Indicator ${String(i + 1)} id`} className={`${fieldBox} w-16`} value={x.indicatorId} onChange={e => { set(i, { indicatorId: e.target.value }); }} />
      <input aria-label={`Indicator ${String(i + 1)} inputs`} className={`${fieldBox} w-32`} placeholder="length=14" value={x.inputsText} onChange={e => { set(i, { inputsText: e.target.value }); }} />
      {withPlot && <input aria-label={`Indicator ${String(i + 1)} plot`} className={`${fieldBox} w-20`} placeholder="plot" value={x.plot ?? ''} onChange={e => { set(i, { plot: e.target.value }); }} />}
      <Button type="button" size="xs" variant="ghost" aria-label={`Remove indicator ${x.name}`} onClick={() => { onChange(items.filter((_, j) => j !== i)); }}>×</Button>
    </div>)}
    <div className="flex gap-1">{Object.entries(defaults).map(([id, d]) =>
      <Button key={id} type="button" size="xs" variant="outline" onClick={() => { onChange([...items, { ...d }]); }}>+ {id.toUpperCase()}</Button>)}</div>
  </fieldset>;
}
