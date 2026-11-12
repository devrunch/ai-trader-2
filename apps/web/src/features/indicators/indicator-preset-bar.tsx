import { useState } from 'react';
import { ApiError } from '../../shared/api/api-error';
import { Button } from '../../shared/ui/button';
import type { InputValues } from './state/indicator-store';
import { defaultOf, plainInputs, useIndicatorPresets, useSavePreset } from './use-indicator-library';

/** Footer of the settings dialog: apply a saved preset, "Save as default", "Save preset as…" (FR-IN-12). */
export function IndicatorPresetBar({ indicatorId, current, onApply }: { indicatorId: string; /** The form's inputs, or null when it has errors. */ current: () => InputValues | null; onApply: (inputs: InputValues) => void }) {
  const presets = useIndicatorPresets();
  const save = useSavePreset();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState('');
  const mine = (presets.data ?? []).filter(p => p.indicatorId === indicatorId);
  const userDefault = defaultOf(presets.data, indicatorId);
  const store = (label: string | null) => {
    const values = current();
    if (!values) return;
    save.mutate({ indicatorId, name: label, inputs: plainInputs(values) },
      { onSuccess: () => { setSaved(label === null ? 'Saved as default' : `Saved preset ${label}`); setNaming(false); setName(''); } });
  };
  return <div className="flex flex-wrap items-center gap-1">
    {mine.length > 0 && <select aria-label="Apply preset" className="h-8 rounded-md border bg-background px-2 text-sm" value=""
      onChange={event => { const found = mine.find(p => p.id === event.target.value); if (found) onApply(found.inputs); }}>
      <option value="">Presets</option>
      {userDefault && <option value={userDefault.id}>Default</option>}
      {mine.filter(p => p.name !== null).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>}
    <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => { setSaved(''); store(null); }}>Save as default</Button>
    {naming
      ? <span className="flex items-center gap-1">
        <input aria-label="Preset name" autoFocus className="h-8 w-32 rounded-md border bg-background px-2 text-sm" maxLength={60} value={name}
          onChange={event => { setName(event.target.value); }}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (name.trim()) store(name.trim()); } }} />
        <Button type="button" variant="outline" disabled={!name.trim() || save.isPending} onClick={() => { store(name.trim()); }}>Save preset</Button>
      </span>
      : <Button type="button" variant="ghost" onClick={() => { setSaved(''); setNaming(true); }}>Save preset as…</Button>}
    {save.error ? <span role="alert" className="text-xs text-destructive">{save.error instanceof ApiError ? save.error.message : 'Could not save'}</span>
      : saved && <span role="status" className="text-xs text-muted-foreground">{saved}</span>}
  </div>;
}
