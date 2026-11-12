import { BacktestSpecSchema, COMPARE_OPS, DEFAULT_COSTS, type BacktestCondition, type BacktestLevel, type BacktestOperand, type BacktestSpec, type Interval } from '@aitrader/contracts';

export type CompareOp = (typeof COMPARE_OPS)[number];
/** An operand is typed as text: a number, a series name, or `name[n]` for n bars back. */
export interface FormCondition { left: string; op: CompareOp; right: string }
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
export const OP_LABELS: Record<CompareOp, string> = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=', neq: '!=', crossesAbove: 'crosses above', crossesBelow: 'crosses below' };
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

const NUMBER = /^-?\d+(\.\d+)?$/;
const OFFSET = /^([A-Za-z][A-Za-z0-9_]*)\[(\d+)\]$/;
function parseOperand(text: string): BacktestOperand {
  const t = text.trim();
  if (NUMBER.test(t)) return { kind: 'value', value: Number(t) };
  const match = OFFSET.exec(t);
  return match ? { kind: 'series', name: match[1] ?? '', offset: Number(match[2]) } : { kind: 'series', name: t };
}
const operandText = (o: BacktestOperand): string => (o.kind === 'value' ? String(o.value) : o.offset === undefined ? o.name : `${o.name}[${String(o.offset)}]`);

function parseLevel(text: string): BacktestLevel | undefined {
  const t = text.trim();
  if (t === '') return undefined;
  const percent = /^(\d+(?:\.\d+)?)\s*%$/.exec(t);
  if (percent) return { kind: 'percent', percent: Number(percent[1]) };
  const multiple = /^(\d+(?:\.\d+)?)\s*[x×]\s*(\S+)$/i.exec(t);
  return multiple ? { kind: 'series', name: multiple[2] ?? '', multiple: Number(multiple[1]) } : { kind: 'series', name: t, multiple: Number.NaN };
}
const levelText = (l: BacktestLevel | undefined): string => (l === undefined ? '' : l.kind === 'percent' ? `${String(l.percent)}%` : `${String(l.multiple)} x ${l.name}`);

function conditionOf(rows: FormCondition[], mode: 'all' | 'any'): BacktestCondition | undefined {
  const compares: BacktestCondition[] = rows.map(r => ({ kind: 'compare', left: parseOperand(r.left), op: r.op, right: parseOperand(r.right) }));
  if (compares.length === 0) return undefined;
  return compares.length === 1 && compares[0] ? compares[0] : { kind: mode, of: compares };
}

function parseInputs(text: string): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const part of text.split(',')) {
    const [key, ...rest] = part.split('=');
    const value = rest.join('=').trim();
    if (!key?.trim() || value === '') continue;
    out[key.trim()] = NUMBER.test(value) ? Number(value) : value === 'true' ? true : value === 'false' ? false : value;
  }
  return out;
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

function rowsOf(condition: BacktestCondition | undefined): { mode: 'all' | 'any'; rows: FormCondition[] } | null {
  if (!condition) return { mode: 'all', rows: [] };
  if (condition.kind === 'compare') return { mode: 'all', rows: [{ left: operandText(condition.left), op: condition.op, right: operandText(condition.right) }] };
  if (condition.kind === 'not' || condition.of.length < 2) return null;
  const rows: FormCondition[] = [];
  for (const c of condition.of) {
    if (c.kind !== 'compare') return null;
    rows.push({ left: operandText(c.left), op: c.op, right: operandText(c.right) });
  }
  return { mode: condition.kind, rows };
}

/** The form for a spec, or null when the spec needs the advanced JSON view (nested logic, `not`). */
export function fromSpec(spec: BacktestSpec): StrategyForm | null {
  const entry = rowsOf(spec.strategy.entry);
  const exit = rowsOf(spec.strategy.exit);
  if (!entry || !exit) return null;
  return { symbol: spec.symbol, interval: spec.interval, bars: spec.bars,
    indicators: spec.indicators.map(i => ({ name: i.name, indicatorId: i.indicatorId, plot: i.plot ?? '',
      inputsText: Object.entries(i.inputs).map(([k, v]) => `${k}=${String(v)}`).join(', ') })),
    side: spec.strategy.side, entryMode: entry.mode, entry: entry.rows, exitMode: exit.mode, exit: exit.rows,
    stopLoss: levelText(spec.strategy.stopLoss), takeProfit: levelText(spec.strategy.takeProfit),
    commissionPct: spec.costs.commissionPct, slippagePct: spec.costs.slippagePct };
}
