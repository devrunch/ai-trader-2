import type { IndicatorDefinition, IndicatorInputDef, IndicatorPlotDef, Interval, PriceSource } from '@aitrader/contracts';
import type { ResolvedInputs } from '../inputs';

export interface Builtin {
  readonly definition: IndicatorDefinition;
  /** The TradingView-equivalent Pine source; its input and plot titles equal the definition's. */
  readonly pine: string;
  /** Bars to read before the first returned bar so recursive state has converged. */
  warmup(inputs: ResolvedInputs, interval: Interval): number;
}

type Spec = Omit<IndicatorDefinition, 'ref' | 'version' | 'levels'> & Partial<Pick<IndicatorDefinition, 'levels'>> & Omit<Builtin, 'definition'>;

export function defineBuiltin({ pine, warmup, levels = [], ...definition }: Spec): Builtin {
  return { definition: { ...definition, ref: `builtin:${definition.id}@1`, version: 1, levels }, pine, warmup };
}

/** Residual below 1e-9 relative for an RMA/EMA of `length` (decay (1 − 1/length)^bars). */
export const recursiveWarmup = (length: number): number => Math.max(500, 10 * length);

export const lengthInput = (fallback: number, title = 'Length'): IndicatorInputDef =>
  ({ id: 'length', title, type: 'int', default: fallback, min: 1, max: 5000 });
export const sourceInputDef = (fallback: PriceSource = 'close'): IndicatorInputDef => ({ id: 'source', title: 'Source', type: 'source', default: fallback });
export const offsetInput: IndicatorInputDef = { id: 'offset', title: 'Offset', type: 'int', default: 0, min: -500, max: 500 };
export const line = (id: string, title: string, color: IndicatorPlotDef['color']): IndicatorPlotDef => ({ id, title, kind: 'line', color, lineWidth: 1 });
