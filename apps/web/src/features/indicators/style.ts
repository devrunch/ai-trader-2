import type { IndicatorDefinition, Interval } from '@aitrader/contracts';

export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;
export type LineStyle = (typeof LINE_STYLES)[number];
export const PLOT_TYPES = ['line', 'step', 'histogram', 'circles', 'area', 'columns'] as const;
export type PlotType = (typeof PLOT_TYPES)[number];
export const PANE_CHOICES = ['parent', 'own', 'price'] as const;
export type PaneChoice = (typeof PANE_CHOICES)[number];
export const MAX_PRECISION = 8;
/** Starting colour of the "Custom" choice. */
export const CUSTOM_COLOR = '#787b86';
export const isCustomColor = (color: string): boolean => color.startsWith('#');

/** A colour is a theme token (INDICATOR_COLORS) or a custom `#rrggbb`. */
export interface PlotStyle { visible: boolean; color: string; lineWidth: number; lineStyle: LineStyle; type: PlotType }
export interface LevelStyle { visible: boolean; color: string; value: number; lineStyle: LineStyle }
export interface IndicatorStyle {
  plots: Record<string, PlotStyle>;
  levels: Record<string, LevelStyle>;
  /** Decimals on the legend and price scale; `null` is the default. */
  precision: number | null;
  /** Only used by an indicator that feeds from another. */
  pane: PaneChoice;
}

export const TIMEFRAME_GROUPS = ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months'] as const;
export type TimeframeGroup = (typeof TIMEFRAME_GROUPS)[number];
export interface TimeframeRange { enabled: boolean; from: number; to: number }
export type IndicatorVisibility = Record<TimeframeGroup, TimeframeRange>;

/** What the dialog edits and the store keeps, apart from the inputs. */
export interface Presentation { style: IndicatorStyle; visibility: IndicatorVisibility }

export const GROUP_LIMITS: Record<TimeframeGroup, number> = { seconds: 59, minutes: 59, hours: 24, days: 366, weeks: 52, months: 12 };

export function defaultVisibility(): IndicatorVisibility {
  return Object.fromEntries(TIMEFRAME_GROUPS.map(group => [group, { enabled: true, from: 1, to: GROUP_LIMITS[group] }])) as IndicatorVisibility;
}

/** The built-in's own look; the stored style is compared against this. */
export function defaultStyle(definition: IndicatorDefinition): IndicatorStyle {
  return {
    plots: Object.fromEntries(definition.plots.map(plot => [plot.id, { visible: true, color: plot.color, lineWidth: plot.lineWidth, lineStyle: 'solid', type: plot.kind }])),
    levels: Object.fromEntries(definition.levels.map(level => [level.id, { visible: true, color: 'gray', value: level.value, lineStyle: 'dashed' }])),
    precision: null,
    pane: 'parent',
  };
}

export const defaultPresentation = (definition: IndicatorDefinition): Presentation => ({ style: defaultStyle(definition), visibility: defaultVisibility() });

/** Saved style over the defaults, so a plot added to a built-in later still has a style. */
export function resolveStyle(definition: IndicatorDefinition, saved: IndicatorStyle | undefined): IndicatorStyle {
  const base = defaultStyle(definition);
  if (!saved) return base;
  return {
    plots: Object.fromEntries(Object.entries(base.plots).map(([id, plot]) => [id, { ...plot, ...saved.plots[id] }])),
    levels: Object.fromEntries(Object.entries(base.levels).map(([id, level]) => [id, { ...level, ...saved.levels[id] }])),
    precision: saved.precision, pane: saved.pane,
  };
}

/** Plot types a plot can switch to without a different series class, so a style change repaints in place. */
export function allowedPlotTypes(kind: IndicatorDefinition['plots'][number]['kind']): readonly PlotType[] {
  if (kind === 'histogram') return ['histogram', 'columns'];
  if (kind === 'area') return ['area'];
  return ['line', 'step', 'circles'];
}

/** The chart's interval as a timeframe group and its count (60 is 1 hour, 240 is 4 hours). */
export function intervalParts(interval: Interval): { group: TimeframeGroup; count: number } {
  switch (interval) {
    case '1D': return { group: 'days', count: 1 };
    case '1W': return { group: 'weeks', count: 1 };
    case '1M': return { group: 'months', count: 1 };
    case '60': return { group: 'hours', count: 1 };
    case '240': return { group: 'hours', count: 4 };
    default: return { group: 'minutes', count: Number(interval) };
  }
}

/** FR-IN-11: shown only where the interval's group is enabled and its count is inside that group's range. */
export function visibleOn(visibility: IndicatorVisibility, interval: Interval): boolean {
  const { group, count } = intervalParts(interval);
  const range = visibility[group];
  return range.enabled && count >= range.from && count <= range.to;
}

export const formatValue = (value: number, precision: number | null): string => value.toFixed(precision ?? 2);

export const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
