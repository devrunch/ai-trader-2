import type { IndicatorDefinition, IndicatorResult } from '@aitrader/contracts';
import type { ChartLike, IndicatorSeriesLike, LinePoint } from './chart-adapter';

interface Painted { key: string; definition: IndicatorDefinition; result: IndicatorResult }
const FIRST_INDICATOR_PANE = 2;
/** Kinds whose line the chart would otherwise join across a null. */
const BREAKS_ON_NULL: ReadonlySet<string> = new Set(['line', 'step', 'area']);
const TRANSPARENT = 'transparent';

/** Paints indicator plots imperatively: overlays on the price pane, the rest on their own panes; levels as price lines. */
export class IndicatorLayer {
  private painted: { item: Painted; pane: number; series: IndicatorSeriesLike[]; data: LinePoint[][] }[] = [];

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
      if (!item || item.result === entry.item.result) return;
      entry.item = item;
      entry.data = item.definition.plots.map(plot => points(item.result, plot.id));
      entry.series.forEach((series, p) => { series.setData(bridged(entry.data[p] ?? [], item.definition.plots[p]?.kind)); });
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

  /** Theme change: every series is created again with the new colours. */
  recolor(): void { const items = this.painted.map(entry => entry.item); this.clear(); this.set(items); }

  destroy(): void { this.clear(); }

  private paint(item: Painted, pane: number) {
    const data = item.definition.plots.map(plot => points(item.result, plot.id));
    const series = item.definition.plots.map((plot, p) => {
      // Names belong in the legend; the price axis shows values only.
      const handle = this.chart.addIndicatorSeries({ kind: plot.kind, color: this.color(plot.color), lineWidth: plot.lineWidth, pane, title: '' });
      handle.setData(bridged(data[p] ?? [], plot.kind));
      return handle;
    });
    for (const level of item.definition.levels) series[0]?.priceLine(level.value, level.title, this.color('gray'));
    return { item, pane, series, data };
  }

  private clear(): void { for (const entry of this.painted) for (const series of entry.series) series.remove(); this.painted = []; }
}

function assignPanes(items: readonly Painted[]): number[] {
  let next = FIRST_INDICATOR_PANE;
  return items.map(item => (item.definition.overlay ? 0 : next++));
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
