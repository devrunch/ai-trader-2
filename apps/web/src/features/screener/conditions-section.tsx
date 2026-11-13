import { ConditionRows, IndicatorRows } from '../../shared/backtest-dsl';
import { INDICATOR_DEFAULTS, SERIES_NAMES, type ScreenForm } from './screener-builder';

export function ConditionsSection({ form, onChange }: { form: ScreenForm; onChange: (patch: Partial<ScreenForm>) => void }) {
  const names = [...SERIES_NAMES, ...form.indicators.map(i => i.name).filter(Boolean)];
  return <div className="space-y-3">
    <IndicatorRows items={form.indicators} defaults={INDICATOR_DEFAULTS} onChange={indicators => { onChange({ indicators }); }} />
    <ConditionRows label="Condition" rows={form.conditions} mode={form.combine} options={names} onRows={conditions => { onChange({ conditions }); }} onMode={combine => { onChange({ combine }); }} />
  </div>;
}
