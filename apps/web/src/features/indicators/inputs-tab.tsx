import { PRICE_SOURCES, type IndicatorInputDef } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';
import { fieldClass as field } from './fields';
import type { Draft } from './input-draft';
import type { SourceOption } from './source-refs';

/** The Inputs tab: one widget per input type (FR-IN-9). */
export function InputsTab({ defs, draft, errors, sources, onChange, onReset }:
  { defs: readonly IndicatorInputDef[]; draft: Draft; errors: Record<string, string>; sources: readonly SourceOption[]; onChange: (id: string, value: string | boolean) => void; onReset: () => void }) {
  return <div className="space-y-2">
    {defs.map(def => <label key={def.id} className="flex items-center justify-between gap-4 text-sm">
      <span>{def.title}</span>
      <span className="flex flex-col items-end">
        <InputWidget def={def} value={draft[def.id]} sources={sources} onChange={value => { onChange(def.id, value); }} />
        {errors[def.id] && <span role="alert" className="text-xs text-destructive">{errors[def.id]}</span>}
      </span>
    </label>)}
    <div className="pt-1"><Button type="button" variant="ghost" onClick={onReset}>Reset settings</Button></div>
  </div>;
}

function InputWidget({ def, value, sources, onChange }: { def: IndicatorInputDef; value: string | boolean | undefined; sources: readonly SourceOption[]; onChange: (value: string | boolean) => void }) {
  const label = def.title;
  switch (def.type) {
    case 'bool':
      return <input type="checkbox" aria-label={label} checked={value === true} onChange={event => { onChange(event.target.checked); }} />;
    case 'string':
      return <select aria-label={label} className={field} value={String(value)} onChange={event => { onChange(event.target.value); }}>
        {def.options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>;
    case 'source': {
      // A saved ref whose indicator is gone stays selectable as "unavailable" until the user picks another source.
      const missing = typeof value === 'string' && !PRICE_SOURCES.some(p => p === value) && !sources.some(s => s.value === value);
      return <select aria-label={label} className={field} value={String(value)} onChange={event => { onChange(event.target.value); }}>
        {PRICE_SOURCES.map(option => <option key={option} value={option}>{option}</option>)}
        {sources.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        {missing && <option value={value}>Source unavailable</option>}
      </select>;
    }
    case 'int':
    case 'float':
      return <input type="number" aria-label={label} className={field} value={String(value)} min={def.min} max={def.max}
        step={def.step ?? (def.type === 'int' ? 1 : 'any')} onChange={event => { onChange(event.target.value); }} />;
  }
}
