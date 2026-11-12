import type { IndicatorDefinition, IndicatorResult } from '@aitrader/contracts';
import { defaultStyle, isCustomColor, sameJson, type IndicatorStyle } from '../indicators';
import type { ChartLike, IndicatorSeriesLike, LevelLine, LinePoint, SeriesStyle } from './chart-adapter';

interface Painted {
  key: string; definition: IndicatorDefinition; result: IndicatorResult;
  /** The indicator this one takes its source from. */
  parentKey?: string | undefined;
  /** The user's style; absent means the definition's own look. */
  style?: IndicatorStyle | undefined;
  /** Hidden on the chart's current interval (FR-IN-11). */
  hidden?: boolean | undefined;
}
const FIRST_INDICATOR_PANE = 2;
/** Kinds whose line the chart would otherwise join across a null. */
const BREAKS_ON_NULL: ReadonlySet<string> = new Set(['line', 'step', 'area']);
const TRANSPARENT = 'transparent';

/** Paints indicator plots imperatively: overlays on the price pane, the rest on their own panes; levels as price lines. */
export class IndicatorLayer {
  private painted: { item: Painted; pane: number; series: IndicatorSeriesLike[]; data: LinePoint[][] }[] = [];
  /** Bar replay: nothing after this time (seconds) is painted. */
  private cutoff: number | null = null;

  constructor(private readonly chart: Pick<ChartLike, 'addIndicatorSeries'>, private readonly color: (token: string) => string) {}

  set(items: readonly Painted[]): void {
    const panes = assignPanes(items);
    const sameLayout = items.length === this.painted.length && items.every((item, i) => {
      const entry = this.painted.at(i);
      return entry !== undefined && entry.item.key === item.key && entry.item.definition === item.definition && entry.pane === panes.at(i);
    });
    if (!sameLayout) { this.clear(); this.painted = items.map((item, i) => this.paint(item, panes[i] ?? 0)); return; }
    this.painted.forEach((entry, i) => {
      const item = items[i];
      if (!item) return;
      const before = entry.item;
      entry.item = item;
      if (item.result !== before.result) {
        entry.data = item.definition.plots.map(plot => points(item.result, plot.id));
        entry.series.forEach((series, p) => { series.setData(bridged(this.visible(entry.data[p] ?? []), item.definition.plots[p]?.kind)); });
      }
      if (!sameJson(item.style, before.style) || item.hidden !== before.hidden) this.restyle(entry);
    });
  }

  /** One live point for one indicator (FR-IN-5): straight to its series, never through React. */
  update(key: string, point: { barTime: number; values: Record<string, number | null> }): void {
    const entry = this.painted.find(e => e.item.key === key);
    if (!entry) return;
    entry.item.definition.plots.forEach((plot, i) => {
      const value = point.values[plot.id];
      const series = entry.series[i];
      const data = entry.data[i];
      if (!series || !data) return;
      const time = point.barTime / 1000;
      if (this.cutoff !== null && time > this.cutoff) return;
      const next: LinePoint = value === null || value === undefined ? { time } : { time, value };
      const last = data.at(-1);
      // An offset plot can report a time before the series' last point; the chart only accepts the last or a newer one.
      if (last && time < last.time) return;
      const replaced = last?.time === time;
      const wasNull = replaced ? !('value' in last) : undefined;
      const isNull = !('value' in next);
      const shapeChanged = isNull ? wasNull !== true && (replaced || last !== undefined) : wasNull === true;
      if (replaced) data[data.length - 1] = next; else data.push(next);
      // A change in where the nulls fall moves the invisible bridge to another, older point, which only a full repaint can reach.
      if (shapeChanged && BREAKS_ON_NULL.has(plot.kind)) series.setData(bridged(data, plot.kind));
      else series.update(next);
    });
  }

  /** Bar replay: hide everything after `time` (ms), or show all again with null. */
  clip(time: number | null): void {
    this.cutoff = time === null ? null : time / 1000;
    for (const entry of this.painted) {
      entry.series.forEach((series, p) => { series.setData(bridged(this.visible(entry.data[p] ?? []), entry.item.definition.plots[p]?.kind)); });
    }
  }

  private visible(data: LinePoint[]): LinePoint[] {
    const cutoff = this.cutoff;
    return cutoff === null ? data : data.filter(point => point.time <= cutoff);
  }

  /** Theme change: every series is created again with the new colours. */
  recolor(): void { const items = this.painted.map(entry => entry.item); this.clear(); this.set(items); }

  destroy(): void { this.clear(); }

  private paint(item: Painted, pane: number) {
    const data = item.definition.plots.map(plot => points(item.result, plot.id));
    const series = item.definition.plots.map((plot, p) => {
      // Names belong in the legend; the price axis shows values only.
      const handle = this.chart.addIndicatorSeries({ kind: plot.kind, pane, title: '', ...this.seriesStyle(item, plot.id) });
      handle.setData(bridged(this.visible(data[p] ?? []), plot.kind));
      return handle;
    });
    const entry = { item, pane, series, data };
    this.setLevels(entry);
    return entry;
  }

  private restyle(entry: { item: Painted; series: IndicatorSeriesLike[] }): void {
    entry.item.definition.plots.forEach((plot, i) => { entry.series[i]?.applyStyle(this.seriesStyle(entry.item, plot.id)); });
    this.setLevels(entry);
  }

  private seriesStyle(item: Painted, plotId: string): SeriesStyle {
    const style = item.style ?? defaultStyle(item.definition);
    const plot = style.plots[plotId] ?? defaultStyle(item.definition).plots[plotId];
    if (!plot) throw new Error(`No style for plot ${plotId}`);
    return { ...plot, visible: plot.visible && item.hidden !== true, color: this.paintColor(plot.color), precision: style.precision };
  }

  private setLevels(entry: { item: Painted; series: IndicatorSeriesLike[] }): void {
    const { item } = entry;
    const style = item.style ?? defaultStyle(item.definition);
    const lines: LevelLine[] = item.hidden === true ? [] : item.definition.levels.flatMap(level => {
      const s = style.levels[level.id];
      return s?.visible ? [{ value: s.value, title: level.title, color: this.paintColor(s.color), lineStyle: s.lineStyle }] : [];
    });
    entry.series[0]?.setLevels(lines);
  }

  private paintColor(color: string): string { return isCustomColor(color) ? color : this.color(color); }

  private clear(): void { for (const entry of this.painted) for (const series of entry.series) series.remove(); this.painted = []; }
}

/** Overlays share the price pane; others get their own, except a child of an indicator on its own pane, which joins that pane (as TradingView does) unless its pane choice says otherwise. */
function assignPanes(items: readonly Painted[]): number[] {
  let next = FIRST_INDICATOR_PANE;
  const byKey = new Map(items.map(item => [item.key, item]));
  const panes = new Map<string, number>();
  const resolve = (item: Painted, visiting: ReadonlySet<string>): number => {
    const known = panes.get(item.key);
    if (known !== undefined) return known;
    const parent = item.parentKey === undefined || visiting.has(item.parentKey) ? undefined : byKey.get(item.parentKey);
    const inherited = parent ? resolve(parent, new Set(visiting).add(item.key)) : 0;
    const choice = item.parentKey === undefined ? 'parent' : (item.style?.pane ?? 'parent');
    const pane = choice === 'price' ? 0 : choice === 'own' ? next++ : inherited !== 0 ? inherited : item.definition.overlay ? 0 : next++;
    panes.set(item.key, pane);
    return pane;
  };
  return items.map(item => resolve(item, new Set()));
}

function points(result: IndicatorResult, plotId: string | undefined): LinePoint[] {
  const values = result.plots.find(plot => plot.id === plotId)?.values ?? [];
  return result.times.map((time, i) => {
    const value = values[i];
    return value === null || value === undefined ? { time: time / 1000 } : { time: time / 1000, value };
  });
}

/**
 * The chart joins the points either side of a null, and strokes the segment ending at a point with the previous
 * point's colour; so the last value before a null is made transparent and the bridge disappears.
 */
function bridged(data: LinePoint[], kind: string | undefined): LinePoint[] {
  if (kind === undefined || !BREAKS_ON_NULL.has(kind)) return data;
  return data.map((point, i) => {
    const next = data[i + 1];
    return 'value' in point && next !== undefined && !('value' in next) ? { ...point, color: TRANSPARENT } : point;
  });
}
