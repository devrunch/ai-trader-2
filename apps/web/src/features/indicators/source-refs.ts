import { isSourceRef, type IndicatorChartInstance, type IndicatorDefinition, type IndicatorSourceRef } from '@aitrader/contracts';
import type { ChartIndicator } from './state/indicator-store';

/** Source choices in the dropdown: a price source is its own name, another indicator's plot is `ref:<key>:<plotId>`. */
const REF_PREFIX = 'ref:';
export const encodeRef = (ref: IndicatorSourceRef): string => `${REF_PREFIX}${ref.from}:${ref.plot}`;
export function decodeRef(text: string): IndicatorSourceRef | undefined {
  if (!text.startsWith(REF_PREFIX)) return undefined;
  const at = text.lastIndexOf(':');
  return at > REF_PREFIX.length ? { from: text.slice(REF_PREFIX.length, at), plot: text.slice(at + 1) } : undefined;
}

/** "RSI 14": short name and the numeric inputs, as the legend and the source dropdown name an indicator. */
export function indicatorLabel(definition: IndicatorDefinition | undefined, item: ChartIndicator): string {
  if (!definition) return item.id;
  const numbers = definition.inputs.filter(def => (def.type === 'int' || def.type === 'float') && def.id !== 'offset')
    .map(def => String(numberOr(item.inputs[def.id], def.default)));
  return [definition.shortName, ...numbers].join(' ');
}

const numberOr = (value: unknown, fallback: unknown): unknown => (typeof value === 'number' ? value : fallback);

const parentOf = (item: ChartIndicator): IndicatorSourceRef | undefined => Object.values(item.inputs).find(isSourceRef);

export const parentKeyOf = (item: ChartIndicator): string | undefined => parentOf(item)?.from;

/** The items `item` reaches through source refs, nearest first. */
export function ancestorsOf(items: readonly ChartIndicator[], item: ChartIndicator): ChartIndicator[] {
  const found: ChartIndicator[] = [];
  for (let next = parentKeyOf(item); next !== undefined && next !== item.key && !found.some(f => f.key === next);) {
    const parent = items.find(candidate => candidate.key === next);
    if (!parent) break;
    found.push(parent);
    next = parentKeyOf(parent);
  }
  return found;
}

/** What the server needs to compute `item`: its ancestors, named by key. */
export function chainOthers(items: readonly ChartIndicator[], item: ChartIndicator, definitions: readonly IndicatorDefinition[] | undefined): IndicatorChartInstance[] {
  return ancestorsOf(items, item).map(parent => ({ instanceId: parent.key, label: indicatorLabel(definitions?.find(d => d.id === parent.id), parent),
    indicator: { kind: 'builtin', id: parent.id, inputs: parent.inputs } }));
}

/** E28: the parent was removed (or is itself unavailable), so the child has no source until it is back. */
export function sourceUnavailable(items: readonly ChartIndicator[], item: ChartIndicator, failed: ReadonlySet<string>): boolean {
  return [item, ...ancestorsOf(items, item)].some(node => {
    const key = parentKeyOf(node);
    return key !== undefined && (!items.some(candidate => candidate.key === key) || failed.has(key));
  });
}

export interface SourceOption { value: string; label: string }

/** Other indicators' plots this one may use as source: not itself and not anything that already uses it. */
export function sourceOptions(items: readonly ChartIndicator[], self: ChartIndicator, definitions: readonly IndicatorDefinition[] | undefined): SourceOption[] {
  return items.filter(other => other.key !== self.key && !ancestorsOf(items, other).some(a => a.key === self.key)).flatMap(other => {
    const definition = definitions?.find(d => d.id === other.id);
    return (definition?.plots ?? []).map(plot => ({ value: encodeRef({ from: other.key, plot: plot.id }), label: `${indicatorLabel(definition, other)}: ${plot.title}` }));
  });
}

