import type { BacktestCondition, BacktestOperand } from '@aitrader/contracts';

/** Named series aligned to the bars (oldest first); null where a value is not defined. */
export type SeriesMap = Readonly<Record<string, ReadonlyArray<number | null | undefined>>>;

const finite = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

/** An operand's value `back` bars before `index`; null when the series is unknown, out of range or not finite. */
function operandAt(operand: BacktestOperand, series: SeriesMap, index: number, back: number): number | null {
  if (operand.kind === 'value') return Number.isFinite(operand.value) ? operand.value : null;
  const at = index - (operand.offset ?? 0) - back;
  if (at < 0) return null;
  const v = series[operand.name]?.[at];
  return finite(v) ? v : null;
}

/** Evaluates a condition on the bar at `index`. Any missing or non-finite input makes the result false. */
export function evaluateCondition(condition: BacktestCondition, series: SeriesMap, index: number): boolean {
  switch (condition.kind) {
    case 'all': return condition.of.every(c => evaluateCondition(c, series, index));
    case 'any': return condition.of.some(c => evaluateCondition(c, series, index));
    case 'not': return !lacksData(condition.of, series, index) && !evaluateCondition(condition.of, series, index);
    case 'compare': {
      const l = operandAt(condition.left, series, index, 0);
      const r = operandAt(condition.right, series, index, 0);
      if (l === null || r === null) return false;
      switch (condition.op) {
        case 'gt': return l > r;
        case 'gte': return l >= r;
        case 'lt': return l < r;
        case 'lte': return l <= r;
        case 'eq': return l === r;
        case 'neq': return l !== r;
        case 'crossesAbove':
        case 'crossesBelow': {
          const pl = operandAt(condition.left, series, index, 1);
          const pr = operandAt(condition.right, series, index, 1);
          if (pl === null || pr === null) return false;
          return condition.op === 'crossesAbove' ? pl <= pr && l > r : pl >= pr && l < r;
        }
      }
    }
  }
}

/** True when some comparison inside lacks data: `not` of unknown data must not turn into a match. */
function lacksData(condition: BacktestCondition, series: SeriesMap, index: number): boolean {
  if (condition.kind === 'compare') {
    const needsPrev = condition.op === 'crossesAbove' || condition.op === 'crossesBelow';
    const back = needsPrev ? 1 : 0;
    return [condition.left, condition.right].some(o => operandAt(o, series, index, back) === null);
  }
  const parts = condition.kind === 'not' ? [condition.of] : condition.of;
  return parts.some(c => lacksData(c, series, index));
}

/** Every series name a condition reads. */
export function conditionSeriesNames(condition: BacktestCondition, into = new Set<string>()): Set<string> {
  if (condition.kind === 'compare') {
    for (const o of [condition.left, condition.right]) if (o.kind === 'series') into.add(o.name);
  } else for (const c of condition.kind === 'not' ? [condition.of] : condition.of) conditionSeriesNames(c, into);
  return into;
}

/** The value of one series on the bar at `index`, or null. */
export function valueAt(series: SeriesMap, name: string, index: number): number | null {
  const v = series[name]?.[index];
  return finite(v) ? v : null;
}
