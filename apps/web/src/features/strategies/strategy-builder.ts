import { BacktestSpecSchema, DEFAULT_COSTS, type BacktestSpec, type Interval } from '@aitrader/contracts';
import { conditionOf, inputsText, levelText, parseInputs, parseLevel, rowsOf, type FormCondition } from '../../shared/backtest-dsl';

export interface FormIndicator { name: string; indicatorId: string; inputsText: string; plot: string }
export interface StrategyForm {
  symbol: string; interval: Interval; bars: number; indicators: FormIndicator[];
  side: 'long' | 'short';
  entryMode: 'all' | 'any'; entry: FormCondition[];
  exitMode: 'all' | 'any'; exit: FormCondition[];
  /** `2%` or `1.5 x atr`; empty means none. */
  stopLoss: string; takeProfit: string;
  commissionPct: number; slippagePct: number;
}
export type BuildResult = { ok: true; spec: BacktestSpec } | { ok: false; error: string };

export const BAR_FIELDS = ['open', 'high', 'low', 'close', 'volume'] as const;
export const INDICATOR_DEFAULTS: Record<string, FormIndicator> = {
  ema: { name: 'ema20', indicatorId: 'ema', inputsText: 'length=20', plot: '' },
  rsi: { name: 'rsi14', indicatorId: 'rsi', inputsText: 'length=14', plot: '' },
  atr: { name: 'atr14', indicatorId: 'atr', inputsText: 'length=14', plot: '' },
};

export function emptyForm(): StrategyForm {
  return { symbol: 'NSE:NIFTY', interval: '5', bars: 2000, indicators: [{ ...INDICATOR_DEFAULTS.ema as FormIndicator }], side: 'long',
    entryMode: 'all', entry: [{ left: 'close', op: 'crossesAbove', right: 'ema20' }], exitMode: 'all', exit: [], stopLoss: '', takeProfit: '',
    commissionPct: DEFAULT_COSTS.commissionPct, slippagePct: DEFAULT_COSTS.slippagePct };
}

export function toSpec(form: StrategyForm): BuildResult {
  const entry = conditionOf(form.entry, form.entryMode);
  if (!entry) return { ok: false, error: 'Add at least one entry condition.' };
  const exit = conditionOf(form.exit, form.exitMode);
  const stopLoss = parseLevel(form.stopLoss);
  const takeProfit = parseLevel(form.takeProfit);
  const parsed = BacktestSpecSchema.safeParse({
    symbol: form.symbol.trim(), interval: form.interval, bars: form.bars,
    indicators: form.indicators.map(i => ({ name: i.name.trim(), indicatorId: i.indicatorId.trim(), inputs: parseInputs(i.inputsText), ...(i.plot.trim() ? { plot: i.plot.trim() } : {}) })),
    strategy: { side: form.side, entry, ...(exit ? { exit } : {}), ...(stopLoss ? { stopLoss } : {}), ...(takeProfit ? { takeProfit } : {}) },
    costs: { commissionPct: form.commissionPct, slippagePct: form.slippagePct },
  });
  if (parsed.success) return { ok: true, spec: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, error: issue ? `${issue.path.join('.') || 'spec'}: ${issue.message}` : 'The strategy is not valid.' };
}

/** The form for a spec, or null when the spec needs the advanced JSON view (nested logic, `not`). */
export function fromSpec(spec: BacktestSpec): StrategyForm | null {
  const entry = rowsOf(spec.strategy.entry);
  const exit = rowsOf(spec.strategy.exit);
  if (!entry || !exit) return null;
  return { symbol: spec.symbol, interval: spec.interval, bars: spec.bars,
    indicators: spec.indicators.map(i => ({ name: i.name, indicatorId: i.indicatorId, plot: i.plot ?? '',
      inputsText: inputsText(i.inputs) })),
    side: spec.strategy.side, entryMode: entry.mode, entry: entry.rows, exitMode: exit.mode, exit: exit.rows,
    stopLoss: levelText(spec.strategy.stopLoss), takeProfit: levelText(spec.strategy.takeProfit),
    commissionPct: spec.costs.commissionPct, slippagePct: spec.costs.slippagePct };
}
