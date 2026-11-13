import { FUNDAMENTAL_FIELDS, ScreenSpecSchema, type FundamentalField, type ScreenSpec, type UniverseId } from '@aitrader/contracts';
import { conditionOf, inputsText, isNumberText, parseInputs, rowsOf, type Combine, type FormCondition } from '../../shared/backtest-dsl';

type ScreenInterval = ScreenSpec['interval'];
export type FundamentalOp = 'gt' | 'gte' | 'lt' | 'lte';
export type ScreenMode = 'preset' | 'conditions' | 'fundamentals';
export interface FormIndicator { name: string; indicatorId: string; inputsText: string }
export interface FormFundamental { field: FundamentalField; op: FundamentalOp; value: string }
export interface ScreenForm {
  universe: UniverseId; interval: ScreenInterval; mode: ScreenMode; preset: string;
  indicators: FormIndicator[]; combine: Combine; conditions: FormCondition[]; fundamentals: FormFundamental[];
}
export type BuildResult = { ok: true; spec: ScreenSpec } | { ok: false; error: string };

/** Series the scanner derives for every symbol, beside the raw bar fields. */
export const SERIES_NAMES = ['open', 'high', 'low', 'close', 'volume', 'highestHigh20', 'volumeRatio', 'range7', 'gapPct'] as const;
export const FUNDAMENTAL_OP_LABELS: Record<FundamentalOp, string> = { gt: '>', gte: '>=', lt: '<', lte: '<=' };
export const FUNDAMENTAL_LABELS: Record<FundamentalField, { label: string; unit: string }> = {
  marketCap: { label: 'Market cap', unit: 'Rs crore' }, pe: { label: 'P/E', unit: 'x' }, bookValue: { label: 'Book value', unit: 'Rs per share' },
  roe: { label: 'ROE', unit: '%' }, roce: { label: 'ROCE', unit: '%' }, dividendYield: { label: 'Dividend yield', unit: '%' },
  debtToEquity: { label: 'Debt to equity', unit: 'x' }, salesGrowth3y: { label: 'Sales growth 3y', unit: '%' }, salesGrowth5y: { label: 'Sales growth 5y', unit: '%' },
  profitGrowth3y: { label: 'Profit growth 3y', unit: '%' }, profitGrowth5y: { label: 'Profit growth 5y', unit: '%' }, promoterHolding: { label: 'Promoter holding', unit: '%' },
};
export const INDICATOR_DEFAULTS: Record<string, FormIndicator> = {
  ema: { name: 'ema20', indicatorId: 'ema', inputsText: 'length=20' }, sma: { name: 'sma50', indicatorId: 'sma', inputsText: 'length=50' },
  rsi: { name: 'rsi14', indicatorId: 'rsi', inputsText: 'length=14' }, atr: { name: 'atr14', indicatorId: 'atr', inputsText: 'length=14' },
};

export function emptyForm(): ScreenForm {
  return { universe: 'nifty50', interval: '1D', mode: 'preset', preset: '', indicators: [], combine: 'all', conditions: [{ left: 'close', op: 'gt', right: 'highestHigh20' }], fundamentals: [] };
}

function body(form: ScreenForm): { part: Record<string, unknown> } | { error: string } {
  if (form.mode === 'preset') return form.preset ? { part: { preset: form.preset } } : { error: 'Pick a preset.' };
  if (form.mode === 'fundamentals') {
    if (form.fundamentals.length === 0) return { error: 'Add at least one fundamental filter.' };
    const bad = form.fundamentals.findIndex(f => !isNumberText(f.value.trim()));
    if (bad >= 0) return { error: `Fundamental filter ${String(bad + 1)} needs a number.` };
    return { part: { fundamentals: form.fundamentals.map(f => ({ field: f.field, op: f.op, value: Number(f.value) })) } };
  }
  const condition = conditionOf(form.conditions, form.combine);
  if (!condition) return { error: 'Add at least one condition.' };
  return { part: { condition, indicators: form.indicators.map(i => ({ name: i.name.trim(), indicatorId: i.indicatorId.trim(), inputs: parseInputs(i.inputsText) })) } };
}

export function toSpec(form: ScreenForm): BuildResult {
  const built = body(form);
  if ('error' in built) return { ok: false, error: built.error };
  const parsed = ScreenSpecSchema.safeParse({ universe: form.universe, interval: form.interval, ...built.part });
  if (parsed.success) return { ok: true, spec: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, error: issue ? `${issue.path.join('.') || 'spec'}: ${issue.message}` : 'The screen is not valid.' };
}

/** The form for a spec, or null when it needs the JSON view (nested logic, `not`, or a mix of preset, conditions and fundamentals). */
export function fromSpec(spec: ScreenSpec): ScreenForm | null {
  const base = { ...emptyForm(), universe: spec.universe, interval: spec.interval, conditions: [] };
  const kinds = [spec.preset !== undefined, spec.condition !== undefined, spec.fundamentals.length > 0].filter(Boolean).length;
  if (kinds !== 1 || (spec.preset !== undefined && spec.indicators.length > 0)) return null;
  if (spec.preset !== undefined) return { ...base, mode: 'preset', preset: spec.preset };
  if (spec.condition === undefined) {
    return { ...base, mode: 'fundamentals', fundamentals: spec.fundamentals.map(f => ({ field: FUNDAMENTAL_FIELDS.find(x => x === f.field) ?? f.field, op: f.op, value: String(f.value) })) };
  }
  const rows = rowsOf(spec.condition);
  if (!rows) return null;
  return { ...base, mode: 'conditions', combine: rows.mode, conditions: rows.rows,
    indicators: spec.indicators.map(i => ({ name: i.name, indicatorId: i.indicatorId, inputsText: inputsText(i.inputs) })) };
}
