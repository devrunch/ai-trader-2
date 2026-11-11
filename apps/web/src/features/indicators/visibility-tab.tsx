import { Button } from '../../shared/ui/button';
import { NumberField, Row } from './fields';
import { GROUP_LIMITS, TIMEFRAME_GROUPS, defaultVisibility, type IndicatorVisibility, type TimeframeGroup, type TimeframeRange } from './style';

const clamp = (value: number, max: number): number => Math.min(max, Math.max(1, Math.round(value)));

/** The Visibility tab (FR-IN-11): per timeframe group, on or off with its own from-to range. */
export function VisibilityTab({ visibility, onChange }: { visibility: IndicatorVisibility; onChange: (visibility: IndicatorVisibility) => void }) {
  const set = (group: TimeframeGroup, range: TimeframeRange) => { onChange({ ...visibility, [group]: range }); };
  return <div className="space-y-2">
    {TIMEFRAME_GROUPS.map(group => {
      const range = visibility[group];
      const max = GROUP_LIMITS[group];
      return <Row key={group} title={group[0]?.toUpperCase() + group.slice(1)}>
        <input type="checkbox" aria-label={`${group} enabled`} checked={range.enabled} onChange={event => { set(group, { ...range, enabled: event.target.checked }); }} />
        <NumberField label={`${group} from`} value={range.from} min={1} max={max} onChange={from => { const next = clamp(from, max); set(group, { ...range, from: next, to: Math.max(next, range.to) }); }} />
        <NumberField label={`${group} to`} value={range.to} min={1} max={max} onChange={to => { const next = clamp(to, max); set(group, { ...range, to: next, from: Math.min(next, range.from) }); }} />
      </Row>;
    })}
    <p className="text-xs text-muted-foreground">Hours: 1 is 1h, 4 is 4h. The chart has no seconds intervals yet.</p>
    <div className="pt-1"><Button type="button" variant="ghost" onClick={() => { onChange(defaultVisibility()); }}>Reset to defaults</Button></div>
  </div>;
}
