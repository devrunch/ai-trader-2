import { isSourceRef, type IndicatorDefinition, type IndicatorInputValues, type IndicatorSpec } from '@aitrader/contracts';
import type { ChartIndicator } from './state/indicator-store';

/** A script's inputs are plain values; it cannot take another indicator as source. */
const plainInputs = (item: ChartIndicator): IndicatorInputValues =>
  Object.fromEntries(Object.entries(item.inputs).flatMap(([id, value]) => (isSourceRef(value) ? [] : [[id, value]])));

/** What the server runs for `item`: a Pine script by source, a built-in by id. Compute, socket and chains all build it here. */
export const specOf = (item: ChartIndicator): IndicatorSpec =>
  (item.pine ? { kind: 'pine', source: item.pine.source, inputs: plainInputs(item) } : { kind: 'builtin', id: item.id, inputs: item.inputs });

/** A Pine item carries its own definition (from describe); a built-in is looked up in the catalog. */
export const definitionOf = (item: ChartIndicator, catalog: readonly IndicatorDefinition[] | undefined): IndicatorDefinition | undefined =>
  item.pine?.definition ?? catalog?.find(d => d.id === item.id);
