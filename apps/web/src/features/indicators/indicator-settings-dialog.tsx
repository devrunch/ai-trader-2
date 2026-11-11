import { useState } from 'react';
import { PRICE_SOURCES, type IndicatorDefinition, type IndicatorInputDef } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';
import { Dialog } from '../../shared/ui/dialog';
import { draftFrom, readDraft, type Draft } from './input-draft';
import type { SourceOption } from './source-refs';
import type { InputValues } from './state/indicator-store';

const field = 'h-8 w-40 rounded-md border bg-background px-2 text-sm';

/** The Inputs tab of TradingView's settings dialog: one widget per input type (FR-IN-9). */
export function IndicatorSettingsDialog({ definition, inputs, sources, onApply, onClose }:
  { definition: IndicatorDefinition; inputs: InputValues; /** Other indicators' plots usable as source (FR-IN-13). */ sources: readonly SourceOption[]; onApply: (values: InputValues) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(definition.inputs, inputs));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (id: string, value: string | boolean) => { setDraft(current => ({ ...current, [id]: value })); };
  const apply = () => {
    const read = readDraft(definition.inputs, draft);
    if (!read.ok) { setErrors(read.errors); return; }
    onApply(read.values);
    onClose();
  };
  return <Dialog title={`${definition.shortName} settings`} description={`Inputs of ${definition.name}`} onClose={onClose}>
    <form noValidate className="space-y-2" onSubmit={event => { event.preventDefault(); apply(); }}>
      {definition.inputs.map(def => <label key={def.id} className="flex items-center justify-between gap-4 text-sm">
        <span>{def.title}</span>
        <span className="flex flex-col items-end">
          <InputWidget def={def} value={draft[def.id]} sources={sources} onChange={value => { set(def.id, value); }} />
          {errors[def.id] && <span role="alert" className="text-xs text-destructive">{errors[def.id]}</span>}
        </span>
      </label>)}
      <div className="flex justify-between pt-2">
        <Button type="button" variant="ghost" onClick={() => { setDraft(draftFrom(definition.inputs, {})); setErrors({}); }}>Reset settings</Button>
        <span className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Ok</Button></span>
      </div>
    </form>
  </Dialog>;
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
