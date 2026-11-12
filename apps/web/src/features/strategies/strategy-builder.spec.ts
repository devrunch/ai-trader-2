import { BacktestSpecSchema, type BacktestSpec } from '@aitrader/contracts';
import { expect, it } from 'vitest';
import { emptyForm, fromSpec, toSpec } from './strategy-builder';

const base = { symbol: 'NSE:RELIANCE', interval: '5', bars: 2000, costs: { commissionPct: 0.03, slippagePct: 0.02 } } as const;
const cmp = (left: string | number, op: string, right: string | number, offset?: number) => ({ kind: 'compare', op,
  left: typeof left === 'number' ? { kind: 'value', value: left } : { kind: 'series', name: left },
  right: typeof right === 'number' ? { kind: 'value', value: right } : { kind: 'series', name: right, ...(offset === undefined ? {} : { offset }) } });
const spec = (value: unknown): BacktestSpec => BacktestSpecSchema.parse(value);

const emaCross = spec({ ...base, indicators: [{ name: 'fast', indicatorId: 'ema', inputs: { length: 9 } }, { name: 'slow', indicatorId: 'ema', inputs: { length: 21 } }],
  strategy: { side: 'long', entry: cmp('fast', 'crossesAbove', 'slow'), exit: cmp('fast', 'crossesBelow', 'slow') } });
const rsiAtr = spec({ ...base, indicators: [{ name: 'rsi14', indicatorId: 'rsi', inputs: { length: 14 } }, { name: 'atr14', indicatorId: 'atr', inputs: { length: 14 } }],
  strategy: { side: 'long', entry: { kind: 'all', of: [cmp('rsi14', 'lt', 30), cmp('close', 'gt', 'open')] }, exit: cmp('rsi14', 'gt', 55),
    stopLoss: { kind: 'series', name: 'atr14', multiple: 2 } } });
const breakout = spec({ ...base, interval: '1D', indicators: [],
  strategy: { side: 'short', entry: cmp('close', 'gt', 'high', 1), takeProfit: { kind: 'percent', percent: 4.5 }, stopLoss: { kind: 'percent', percent: 2 } } });
const nested = spec({ ...base, indicators: [{ name: 'rsi14', indicatorId: 'rsi', inputs: { length: 14 } }],
  strategy: { side: 'long', entry: { kind: 'all', of: [cmp('close', 'gt', 'open'), { kind: 'any', of: [cmp('rsi14', 'lt', 30), cmp('rsi14', 'gt', 70)] }] } } });

it.each([['EMA cross', emaCross], ['RSI oversold with ATR stop', rsiAtr], ['breakout with percent target', breakout]])('round-trips %s through the form', (_name, original) => {
  const form = fromSpec(original);
  expect(form).not.toBeNull();
  if (!form) return;
  expect(toSpec(form)).toEqual({ ok: true, spec: original });
});

it('shows the RSI spec as typed fields', () => {
  const form = fromSpec(rsiAtr);
  expect(form?.stopLoss).toBe('2 x atr14');
  expect(form?.entry).toEqual([{ left: 'rsi14', op: 'lt', right: '30' }, { left: 'close', op: 'gt', right: 'open' }]);
  expect(fromSpec(breakout)?.entry[0]?.right).toBe('high[1]');
});

it('falls back to advanced JSON for nested any inside all', () => {
  expect(fromSpec(nested)).toBeNull();
  expect(fromSpec({ ...emaCross, strategy: { ...emaCross.strategy, entry: { kind: 'not', of: cmp('close', 'gt', 'open') as never } } })).toBeNull();
});

it('rejects a form with no entry condition, a bad stop and a bad series name', () => {
  const form = emptyForm();
  expect(toSpec({ ...form, entry: [] }).ok).toBe(false);
  expect(toSpec({ ...form, stopLoss: 'tight' }).ok).toBe(false);
  expect(toSpec({ ...form, entry: [{ left: 'close', op: 'gt', right: '9 bad name' }] }).ok).toBe(false);
  expect(toSpec({ ...form, symbol: 'nifty' }).ok).toBe(false);
  expect(toSpec(form).ok).toBe(true);
});
