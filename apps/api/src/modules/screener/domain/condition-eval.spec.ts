import type { BacktestCondition } from '@aitrader/contracts';
import { describe, expect, it } from 'vitest';
import { conditionSeriesNames, evaluateCondition } from './condition-eval';

const s = (name: string, offset?: number) => ({ kind: 'series' as const, name, ...(offset === undefined ? {} : { offset }) });
const v = (value: number) => ({ kind: 'value' as const, value });
const cmp = (left: ReturnType<typeof s> | ReturnType<typeof v>, op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'crossesAbove' | 'crossesBelow', right: ReturnType<typeof s> | ReturnType<typeof v>): BacktestCondition => ({ kind: 'compare', left, op, right });
const series = { a: [1, 2, 3, 5], b: [4, 3, 3, 4], n: [1, null, 2, null], nan: [1, 2, 3, Number.NaN] };

describe('evaluateCondition', () => {
  it.each([
    ['gt', 5, 4, true], ['gt', 4, 4, false], ['gte', 4, 4, true], ['lt', 3, 4, true], ['lt', 4, 4, false], ['lte', 4, 4, true], ['eq', 4, 4, true], ['eq', 3, 4, false], ['neq', 3, 4, true], ['neq', 4, 4, false],
  ] as const)('%s on %s vs %s returns %s', (op, l, r, expected) => {
    expect(evaluateCondition(cmp(v(l), op, v(r)), {}, 0)).toBe(expected);
  });
  it('crossesAbove needs the previous bar at or below and the latest above', () => {
    expect(evaluateCondition(cmp(s('a'), 'crossesAbove', s('b')), series, 3)).toBe(true);
    expect(evaluateCondition(cmp(s('a'), 'crossesAbove', s('b')), series, 2)).toBe(false);
    expect(evaluateCondition(cmp(s('a'), 'crossesAbove', s('b')), series, 0)).toBe(false);
  });
  it('crossesBelow needs the previous bar at or above and the latest below', () => {
    expect(evaluateCondition(cmp(s('b'), 'crossesBelow', s('a')), series, 3)).toBe(true);
    expect(evaluateCondition(cmp(s('b'), 'crossesBelow', s('a')), series, 2)).toBe(false);
    expect(evaluateCondition(cmp(s('b'), 'crossesBelow', s('a')), { b: [5, 3], a: [4, 4] }, 1)).toBe(true);
  });
  it('reads an offset operand that many bars back and is false before the series starts', () => {
    expect(evaluateCondition(cmp(s('a'), 'gt', s('a', 1)), series, 3)).toBe(true);
    expect(evaluateCondition(cmp(s('a', 3), 'eq', v(1)), series, 3)).toBe(true);
    expect(evaluateCondition(cmp(s('a', 1), 'gt', v(0)), series, 0)).toBe(false);
  });
  it('combines with all, any and not, nested', () => {
    const yes = cmp(v(1), 'lt', v(2));
    const no = cmp(v(2), 'lt', v(1));
    expect(evaluateCondition({ kind: 'all', of: [yes, yes] }, {}, 0)).toBe(true);
    expect(evaluateCondition({ kind: 'all', of: [yes, no] }, {}, 0)).toBe(false);
    expect(evaluateCondition({ kind: 'any', of: [no, yes] }, {}, 0)).toBe(true);
    expect(evaluateCondition({ kind: 'any', of: [no, no] }, {}, 0)).toBe(false);
    expect(evaluateCondition({ kind: 'not', of: no }, {}, 0)).toBe(true);
    expect(evaluateCondition({ kind: 'all', of: [{ kind: 'not', of: { kind: 'any', of: [no, no] } }, yes] }, {}, 0)).toBe(true);
  });
  it('is false when any input is null, NaN or an unknown series, even under not', () => {
    expect(evaluateCondition(cmp(s('n'), 'lt', v(5)), series, 1)).toBe(false);
    expect(evaluateCondition(cmp(s('nan'), 'lt', v(5)), series, 3)).toBe(false);
    expect(evaluateCondition(cmp(s('missing'), 'neq', v(5)), series, 1)).toBe(false);
    expect(evaluateCondition({ kind: 'not', of: cmp(s('n'), 'lt', v(5)) }, series, 1)).toBe(false);
    expect(evaluateCondition(cmp(s('n'), 'crossesAbove', v(1)), series, 2)).toBe(false);
    expect(evaluateCondition(cmp(v(Number.NaN), 'lt', v(1)), {}, 0)).toBe(false);
  });
  it('lists the series a condition reads', () => {
    expect([...conditionSeriesNames({ kind: 'all', of: [cmp(s('a'), 'gt', v(1)), { kind: 'not', of: cmp(s('b'), 'lt', s('c')) }] })].sort()).toEqual(['a', 'b', 'c']);
  });
});
