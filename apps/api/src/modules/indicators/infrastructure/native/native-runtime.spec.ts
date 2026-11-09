import { describe, expect, it } from 'vitest';
import type { Bar } from '@aitrader/contracts';
import { BUILTINS, findBuiltin } from '../../domain/catalog';
import { resolveInputs } from '../../domain/inputs';
import { NativeRuntime } from './native-runtime';
import { fixtureBars } from './bars.spec-helper';

const context = { instrumentId: 'TEST:X', interval: '15' as const, timezone: 'UTC' };
const runtime = new NativeRuntime();
const create = (id: string, raw: Record<string, unknown> = {}) => {
  const builtin = findBuiltin(id);
  return runtime.create({ kind: 'builtin', builtin, inputs: resolveInputs(builtin.definition.inputs, raw) }, context);
};
const closes = (values: number[]): Bar[] => values.map((close, i) => ({ time: i, open: close, high: close, low: close, close, volume: 1 }));

describe('NativeRuntime', () => {
  it('computes hand-checked values', async () => {
    expect((await create('sma', { length: 3 }).seed(closes([1, 2, 3, 4, 5]))).map(row => row.ma)).toEqual([null, null, 2, 3, 4]);
    expect((await create('ema', { length: 3 }).seed(closes([1, 2, 3, 4, 5]))).map(row => row.ma)).toEqual([null, null, 2, 3, 4]);
    expect((await create('wma', { length: 3 }).seed(closes([1, 2, 3]))).map(row => row.ma)).toEqual([null, null, 14 / 6]);
    expect((await create('rsi', { length: 3 }).seed(closes([1, 2, 3, 4, 5]))).map(row => row.rsi)).toEqual([null, null, null, 100, 100]);
  });

  it.each(BUILTINS.map(b => b.definition.id))('%s: ticks on the forming bar end equal to a fresh full run (FR-IN-6)', async id => {
    const bars = fixtureBars(300);
    const instance = create(id);
    await instance.seed(bars.slice(0, -2));
    const forming = bars.at(-2);
    const next = bars.at(-1);
    if (!forming || !next) throw new Error('fixture too short');
    const ticks = [forming.open, forming.high, forming.low, (forming.high + forming.low) / 2];
    for (const [i, close] of ticks.entries()) {
      await instance.update({ ...forming, close, volume: Math.round((forming.volume ?? 0) / 2) }, i > 0);
    }
    await instance.update(forming, true);
    const live = await instance.update(next, false);
    const fresh = await create(id).seed(bars);
    expect(live).toEqual(fresh.at(-1));
  });

  it('treats a missing volume as zero and leaves VWAP empty while the period has no volume', async () => {
    const bars = closes([10, 11]).map(bar => ({ ...bar, volume: null }));
    expect((await create('vwap').seed(bars)).map(row => row.vwap)).toEqual([null, null]);
  });

  it('runs built-ins only', () => {
    const builtin = findBuiltin('rsi');
    expect(runtime.supports({ kind: 'builtin', builtin, inputs: {} })).toBe(true);
    expect(runtime.supports({ kind: 'pine', source: 'plot(close)', inputs: {} })).toBe(false);
    expect(() => runtime.create({ kind: 'pine', source: 'plot(close)', inputs: {} }, context)).toThrow('The native runtime only runs its built-ins');
  });
});
