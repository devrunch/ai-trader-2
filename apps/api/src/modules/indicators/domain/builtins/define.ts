import type { IndicatorDefinition, IndicatorInputDef, IndicatorPlotDef, Interval, PriceSource } from '@aitrader/contracts';
import type { ResolvedInputs } from '../inputs';

export interface Builtin {
  readonly definition: IndicatorDefinition;
  /** The TradingView-equivalent Pine source; its input and plot titles equal the definition's. */
  readonly pine: string;
  /** Bars to read before the first returned bar so recursive state has converged. */
  warmup(inputs: ResolvedInputs, interval: Interval): number;
  /** Plots TradingView draws with their own `offset`, added to the `offset` input; plot id → bars. */
  plotOffsets?(inputs: ResolvedInputs): Readonly<Record<string, number>>;
}

type Spec = Omit<IndicatorDefinition, 'ref' | 'version' | 'levels'> & Partial<Pick<IndicatorDefinition, 'levels'>> & Omit<Builtin, 'definition'>;

export function defineBuiltin({ pine, warmup, plotOffsets, levels = [], ...definition }: Spec): Builtin {
  return { definition: { ...definition, ref: `builtin:${definition.id}@1`, version: 1, levels }, pine, warmup, ...(plotOffsets && { plotOffsets }) };
}

const DAYS_PER_BAR: Record<Interval, number> = { '1S': 1 / 86400, '5S': 5 / 86400, '15S': 15 / 86400, '30S': 30 / 86400, '1': 1 / 1440, '3': 3 / 1440, '5': 5 / 1440, '15': 15 / 1440, '30': 30 / 1440,
  '60': 1 / 24, '240': 1 / 6, '1D': 1, '1W': 7, '1M': 31 };

/** Bars that cover `days` calendar days on `interval`. */
export const barsInDays = (days: number, interval: Interval): number => Math.ceil(days / DAYS_PER_BAR[interval]);

/** Residual below 1e-9 relative for an RMA/EMA of `length` (decay (1 − 1/length)^bars). */
export const recursiveWarmup = (length: number): number => Math.max(500, 10 * length);

export const lengthInput = (fallback: number, title = 'Length'): IndicatorInputDef =>
  ({ id: 'length', title, type: 'int', default: fallback, min: 1, max: 5000 });
export const sourceInputDef = (fallback: PriceSource = 'close'): IndicatorInputDef => ({ id: 'source', title: 'Source', type: 'source', default: fallback });
export const offsetInput: IndicatorInputDef = { id: 'offset', title: 'Offset', type: 'int', default: 0, min: -500, max: 500 };
export const line = (id: string, title: string, color: IndicatorPlotDef['color']): IndicatorPlotDef => ({ id, title, kind: 'line', color, lineWidth: 1 });
