import { PRICE_SOURCES, INDICATOR_COLORS, type IndicatorDefinition, type IndicatorInputDef, type IndicatorPlotDef, type PriceSource } from '@aitrader/contracts';

/** What PineTS reports about a script: its `input.*` calls, plots and hlines. Only the fields the definition needs. */
export interface PineInputMeta { type: string; title: string; defval: unknown; tooltip?: string | undefined; group?: string | undefined;
  minval?: number | undefined; maxval?: number | undefined; step?: number | undefined; options?: string[] | undefined }
export interface PinePlotMeta { key: string; title: string; style?: string | undefined }
export interface PineMeta { title: string; shortTitle: string; overlay: boolean; inputs: PineInputMeta[]; plots: PinePlotMeta[]; levels: { title: string; value: number }[] }

const PLOT_KIND: Record<string, IndicatorPlotDef['kind']> = {
  style_line: 'line', style_linebr: 'line', style_stepline: 'step', style_stepline_diamond: 'step', style_histogram: 'histogram', style_columns: 'histogram',
  style_area: 'area', style_areabr: 'area', style_circles: 'circles', style_cross: 'circles',
};

/** `"MA type"` → `maType`; the same function names inputs, plots and levels so a result and its definition agree. */
export function idFromTitle(title: string, taken: ReadonlySet<string>, fallback: string): string {
  const words = title.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const camel = words.map((word, i) => i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1)).join('');
  const base = (/^[A-Za-z]/.test(camel) ? camel : `${fallback}${camel}`).slice(0, 36);
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}${String(n)}`;
  return id;
}

/** Ids for a list of titles, in order, unique. */
export function idsFromTitles(titles: readonly string[], fallback: string): string[] {
  const taken = new Set<string>();
  return titles.map(title => {
    const id = idFromTitle(title, taken, fallback);
    taken.add(id);
    return id;
  });
}

function inputDef(meta: PineInputMeta, id: string): IndicatorInputDef | null {
  const common = { id, title: meta.title.slice(0, 80), ...(meta.group ? { group: meta.group.slice(0, 80) } : {}), ...(meta.tooltip ? { tooltip: meta.tooltip.slice(0, 300) } : {}) };
  const bounds = { ...(meta.minval === undefined ? {} : { min: meta.minval }), ...(meta.maxval === undefined ? {} : { max: meta.maxval }), ...(meta.step !== undefined && meta.step > 0 ? { step: meta.step } : {}) };
  const { defval } = meta;
  switch (meta.type) {
    case 'int': return typeof defval === 'number' && Number.isInteger(defval) ? { ...common, ...bounds, type: 'int', default: defval } : null;
    case 'float': return typeof defval === 'number' && Number.isFinite(defval) ? { ...common, ...bounds, type: 'float', default: defval } : null;
    case 'bool': return typeof defval === 'boolean' ? { ...common, type: 'bool', default: defval } : null;
    case 'string': return typeof defval === 'string' && meta.options?.includes(defval) ? { ...common, type: 'string', default: defval, options: [...meta.options] } : null;
    case 'source': return isPriceSource(defval) ? { ...common, type: 'source', default: defval } : null;
    default: return null;
  }
}

function isPriceSource(value: unknown): value is PriceSource {
  return PRICE_SOURCES.some(source => source === value);
}

/** Input ids of every `input.*` call, in call order; `null` where the dialog cannot edit that kind (color, time, free text, …). */
export function pineInputIds(inputs: readonly PineInputMeta[]): string[] {
  return idsFromTitles(inputs.map(input => input.title), 'in');
}

/** FR-IN-31: a Pine script described like a built-in, so the settings dialog and the legend need no second path. */
export function buildPineDefinition(meta: PineMeta, hash: string): IndicatorDefinition {
  const inputIds = pineInputIds(meta.inputs);
  const inputs = meta.inputs.flatMap((input, i) => inputDef(input, inputIds[i] ?? '') ?? []);
  const plotIds = idsFromTitles(meta.plots.map(plot => plot.title), 'plot');
  const levelIds = idsFromTitles(meta.levels.map(level => level.title), 'level');
  return {
    ref: `pine:${hash}@1`, id: `pine${hash}`, version: 1,
    name: meta.title.slice(0, 120) || 'Pine script', shortName: (meta.shortTitle || meta.title).slice(0, 40) || 'Pine',
    overlay: meta.overlay,
    inputs,
    plots: meta.plots.map((plot, i) => ({ id: plotIds[i] ?? '', title: plot.title.slice(0, 80), kind: PLOT_KIND[plot.style ?? ''] ?? 'line',
      color: INDICATOR_COLORS[i % INDICATOR_COLORS.length] ?? 'blue', lineWidth: 1 })),
    levels: meta.levels.map((level, i) => ({ id: levelIds[i] ?? '', title: level.title.slice(0, 80), value: level.value })),
  };
}
