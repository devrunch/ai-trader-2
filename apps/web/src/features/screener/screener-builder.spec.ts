import { ScreenSpecSchema, type ScreenSpec } from '@aitrader/contracts';
import { expect, it } from 'vitest';
import { emptyForm, fromSpec, toSpec } from './screener-builder';

const spec = (value: unknown): ScreenSpec => ScreenSpecSchema.parse(value);
const cmp = (left: string, op: string, right: string | number) => ({ kind: 'compare', op, left: { kind: 'series', name: left },
  right: typeof right === 'number' ? { kind: 'value', value: right } : { kind: 'series', name: right } });

const preset = spec({ universe: 'nifty50', interval: '1D', preset: 'oversold-rsi' });
const emaCross = spec({ universe: 'nifty100', interval: '60', indicators: [{ name: 'fast', indicatorId: 'ema', inputs: { length: 9 } }, { name: 'slow', indicatorId: 'ema', inputs: { length: 21 } }],
  condition: { kind: 'all', of: [cmp('fast', 'crossesAbove', 'slow'), cmp('volumeRatio', 'gt', 2)] } });
const fundamentalsOnly = spec({ universe: 'nifty500', interval: '1D', fundamentals: [{ field: 'pe', op: 'lt', value: 20 }, { field: 'roe', op: 'gte', value: 15 }] });
const nested = spec({ universe: 'nifty50', interval: '15', indicators: [{ name: 'rsi14', indicatorId: 'rsi', inputs: { length: 14 } }],
  condition: { kind: 'all', of: [cmp('close', 'gt', 'open'), { kind: 'any', of: [cmp('rsi14', 'lt', 30), cmp('rsi14', 'gt', 70)] }] } });

const built = (form: ReturnType<typeof emptyForm>): ScreenSpec => {
  const r = toSpec(form);
  if (!r.ok) throw new Error(r.error);
  return r.spec;
};

it('round-trips a preset spec', () => {
  const form = fromSpec(preset);
  expect(form).toMatchObject({ mode: 'preset', preset: 'oversold-rsi', universe: 'nifty50', interval: '1D' });
  expect(form && built(form)).toEqual(preset);
});

it('round-trips an EMA-cross conditions spec', () => {
  const form = fromSpec(emaCross);
  expect(form?.mode).toBe('conditions');
  expect(form?.conditions).toEqual([{ left: 'fast', op: 'crossesAbove', right: 'slow' }, { left: 'volumeRatio', op: 'gt', right: '2' }]);
  expect(form?.indicators.map(i => i.inputsText)).toEqual(['length=9', 'length=21']);
  expect(form && built(form)).toEqual(emaCross);
});

it('round-trips a fundamentals-only spec', () => {
  const form = fromSpec(fundamentalsOnly);
  expect(form).toMatchObject({ mode: 'fundamentals', fundamentals: [{ field: 'pe', op: 'lt', value: '20' }, { field: 'roe', op: 'gte', value: '15' }] });
  expect(form && built(form)).toEqual(fundamentalsOnly);
});

it('returns null for nested logic so the page falls back to JSON', () => {
  expect(fromSpec(nested)).toBeNull();
});

it('returns null for a preset combined with fundamentals', () => {
  expect(fromSpec(spec({ universe: 'nifty50', interval: '1D', preset: 'oversold-rsi', fundamentals: [{ field: 'pe', op: 'lt', value: 20 }] }))).toBeNull();
});

it('explains an empty conditions form and an unset preset', () => {
  expect(toSpec({ ...emptyForm(), mode: 'conditions', conditions: [] })).toEqual({ ok: false, error: 'Add at least one condition.' });
  expect(toSpec({ ...emptyForm(), mode: 'preset', preset: '' })).toEqual({ ok: false, error: 'Pick a preset.' });
  expect(toSpec({ ...emptyForm(), mode: 'fundamentals', fundamentals: [] })).toEqual({ ok: false, error: 'Add at least one fundamental filter.' });
});

it('rejects a fundamental filter without a number', () => {
  const r = toSpec({ ...emptyForm(), mode: 'fundamentals', fundamentals: [{ field: 'pe', op: 'lt', value: '' }] });
  expect(r).toEqual({ ok: false, error: 'Fundamental filter 1 needs a number.' });
});
