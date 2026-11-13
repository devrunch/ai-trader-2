import { SCREEN_INTERVALS, type ScreenPreset, type UniverseInfo } from '@aitrader/contracts';
import { ConditionsSection } from './conditions-section';
import { FundamentalsSection } from './fundamentals-section';
import type { ScreenForm, ScreenMode } from './screener-builder';

const box = 'h-7 min-w-0 rounded border bg-background px-1.5';
const INTERVAL_LABELS: Record<(typeof SCREEN_INTERVALS)[number], string> = { '15': '15m', '60': '1h', '1D': '1D' };
const MODES: Array<{ id: ScreenMode; label: string }> = [{ id: 'preset', label: 'Preset' }, { id: 'conditions', label: 'Conditions' }, { id: 'fundamentals', label: 'Fundamentals' }];

export function ScreenFormFields({ form, universes, presets, onChange }: { form: ScreenForm; universes: UniverseInfo[]; presets: ScreenPreset[]; onChange: (patch: Partial<ScreenForm>) => void }) {
  const universe = universes.find(u => u.id === form.universe);
  const preset = presets.find(p => p.id === form.preset);
  return <div className="space-y-3 text-[12px]">
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1">Universe
        <select aria-label="Universe" className={box} value={form.universe} onChange={e => { onChange({ universe: universes.find(u => u.id === e.target.value)?.id ?? form.universe }); }}>
          {universes.length === 0 && <option value={form.universe}>{form.universe}</option>}
          {universes.map(u => <option key={u.id} value={u.id}>{`${u.name} (${String(u.count)})`}</option>)}</select></label>
      <label className="flex items-center gap-1">Interval
        <select aria-label="Interval" className={box} value={form.interval} onChange={e => { onChange({ interval: SCREEN_INTERVALS.find(i => i === e.target.value) ?? form.interval }); }}>
          {SCREEN_INTERVALS.map(i => <option key={i} value={i}>{INTERVAL_LABELS[i]}</option>)}</select></label>
    </div>
    {universe?.note && <p className="text-muted-foreground">{universe.note}</p>}
    <div role="tablist" aria-label="Screen type" className="flex gap-1 border-b">
      {MODES.map(m => <button key={m.id} type="button" role="tab" aria-selected={form.mode === m.id} onClick={() => { onChange({ mode: m.id }); }}
        className={`px-2 py-1 ${form.mode === m.id ? 'border-b-2 border-foreground font-semibold' : 'text-muted-foreground'}`}>{m.label}</button>)}
    </div>
    {form.mode === 'preset' && <div className="space-y-1">
      <label className="flex items-center gap-1">Preset
        <select aria-label="Preset" className={box} value={form.preset} onChange={e => { onChange({ preset: e.target.value }); }}>
          <option value="">Choose a preset</option>{presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {preset && <p className="text-muted-foreground">{preset.description}</p>}</div>}
    {form.mode === 'conditions' && <ConditionsSection form={form} onChange={onChange} />}
    {form.mode === 'fundamentals' && <FundamentalsSection rows={form.fundamentals} onChange={fundamentals => { onChange({ fundamentals }); }} />}
  </div>;
}
