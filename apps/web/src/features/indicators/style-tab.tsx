import { INDICATOR_COLORS, type IndicatorDefinition } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';
import { NumberField, Row, SelectField } from './fields';
import { CUSTOM_COLOR, LINE_STYLES, MAX_PRECISION, PANE_CHOICES, allowedPlotTypes, defaultStyle, isCustomColor, type IndicatorStyle, type LevelStyle, type PaneChoice, type PlotStyle } from './style';

const CUSTOM = 'custom';
const colorOptions = [...INDICATOR_COLORS.map(token => [token, token] as const), [CUSTOM, 'Custom'] as const];
const lineStyleOptions = LINE_STYLES.map(style => [style, style] as const);
const widthOptions = [1, 2, 3, 4].map(width => [String(width), `${String(width)}px`] as const);
const precisionOptions: readonly (readonly [string, string])[] = [['default', 'Default'], ...Array.from({ length: MAX_PRECISION + 1 }, (_, n) => [String(n), String(n)] as const)];
const paneOptions: Record<PaneChoice, string> = { parent: "Parent's pane", own: 'Own pane', price: 'Price pane' };

/** The Style tab (FR-IN-10): plots, levels, precision and, for a chained indicator, the pane. */
export function StyleTab({ definition, style, chained, onChange }:
  { definition: IndicatorDefinition; style: IndicatorStyle; chained: boolean; onChange: (style: IndicatorStyle) => void }) {
  const setPlot = (id: string, patch: Partial<PlotStyle>) => { const current = style.plots[id]; if (current) onChange({ ...style, plots: { ...style.plots, [id]: { ...current, ...patch } } }); };
  const setLevel = (id: string, patch: Partial<LevelStyle>) => { const current = style.levels[id]; if (current) onChange({ ...style, levels: { ...style.levels, [id]: { ...current, ...patch } } }); };
  return <div className="space-y-2">
    {definition.plots.map(plot => {
      const s = style.plots[plot.id];
      if (!s) return null;
      return <Row key={plot.id} title={plot.title}>
        <input type="checkbox" aria-label={`${plot.title} visible`} checked={s.visible} onChange={event => { setPlot(plot.id, { visible: event.target.checked }); }} />
        <ColorField label={`${plot.title} colour`} color={s.color} onChange={color => { setPlot(plot.id, { color }); }} />
        <SelectField small label={`${plot.title} width`} value={String(s.lineWidth)} options={widthOptions} onChange={value => { setPlot(plot.id, { lineWidth: Number(value) }); }} />
        <SelectField small label={`${plot.title} line style`} value={s.lineStyle} options={lineStyleOptions} onChange={value => { setPlot(plot.id, { lineStyle: LINE_STYLES.find(l => l === value) ?? 'solid' }); }} />
        <SelectField small label={`${plot.title} plot type`} value={s.type} options={allowedPlotTypes(plot.kind).map(type => [type, type] as const)}
          onChange={value => { const type = allowedPlotTypes(plot.kind).find(t => t === value); if (type) setPlot(plot.id, { type }); }} />
      </Row>;
    })}
    {definition.levels.map(level => {
      const s = style.levels[level.id];
      if (!s) return null;
      return <Row key={level.id} title={level.title}>
        <input type="checkbox" aria-label={`${level.title} visible`} checked={s.visible} onChange={event => { setLevel(level.id, { visible: event.target.checked }); }} />
        <ColorField label={`${level.title} colour`} color={s.color} onChange={color => { setLevel(level.id, { color }); }} />
        <NumberField label={`${level.title} value`} value={s.value} min={-1e9} max={1e9} step="any" onChange={value => { setLevel(level.id, { value }); }} />
        <SelectField small label={`${level.title} line style`} value={s.lineStyle} options={lineStyleOptions} onChange={value => { setLevel(level.id, { lineStyle: LINE_STYLES.find(l => l === value) ?? 'dashed' }); }} />
      </Row>;
    })}
    <Row title="Precision">
      <SelectField small label="Precision" value={style.precision === null ? 'default' : String(style.precision)} options={precisionOptions}
        onChange={value => { onChange({ ...style, precision: value === 'default' ? null : Number(value) }); }} />
    </Row>
    {chained && <Row title="Pane">
      <SelectField label="Pane" value={style.pane} options={PANE_CHOICES.map(choice => [choice, paneOptions[choice]] as const)}
        onChange={value => { onChange({ ...style, pane: PANE_CHOICES.find(p => p === value) ?? 'parent' }); }} />
    </Row>}
    <div className="pt-1"><Button type="button" variant="ghost" onClick={() => { onChange(defaultStyle(definition)); }}>Reset to defaults</Button></div>
  </div>;
}

/** A theme colour token or a custom colour that stays as picked in either theme. */
function ColorField({ label, color, onChange }: { label: string; color: string; onChange: (color: string) => void }) {
  const custom = isCustomColor(color);
  return <>
    <SelectField small label={label} value={custom ? CUSTOM : color} options={colorOptions} onChange={value => { onChange(value === CUSTOM ? CUSTOM_COLOR : value); }} />
    {custom && <input type="color" aria-label={`${label} custom`} value={color} className="h-8 w-8 rounded border bg-background" onChange={event => { onChange(event.target.value); }} />}
  </>;
}
