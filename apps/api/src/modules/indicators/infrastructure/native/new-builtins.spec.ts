import { describe, expect, it } from 'vitest';
import type { Bar } from '@aitrader/contracts';
import { findBuiltin } from '../../domain/catalog';
import { resolveInputs } from '../../domain/inputs';
import { NativeRuntime } from './native-runtime';

const HOUR = 3_600_000;
const run = async (id: string, raw: Record<string, unknown>, bars: Bar[], timezone = 'UTC') => {
  const builtin = findBuiltin(id);
  const instance = new NativeRuntime().create({ kind: 'builtin', builtin, inputs: resolveInputs(builtin.definition.inputs, raw) },
    { instrumentId: 'TEST:X', interval: '60', timezone });
  return instance.seed(bars);
};
const column = (rows: Awaited<ReturnType<typeof run>>, id: string) => rows.map(row => row[id] ?? null);
const bar = (time: number, high: number, low: number, close: number, volume = 1): Bar => ({ time, open: close, high, low, close, volume });
const flat = (closes: number[], volumes?: number[]): Bar[] => closes.map((close, i) => bar(i * HOUR, close, close, close, volumes?.[i] ?? 1));

// FR-IN-2, FR-IN-7: hand-checked values for the P4-13a built-ins, independent of the Pine parity run.
describe('P4-13a native built-ins', () => {
  it('accumulates OBV from the second bar by the sign of the close change', async () => {
    expect(column(await run('obv', {}, flat([10, 11, 10.5, 10.5, 12], [5, 3, 2, 4, 6])), 'obv')).toEqual([null, 3, 1, 1, 7]);
  });

  it('computes ROC and momentum against the source length bars back', async () => {
    expect(column(await run('roc', { length: 2 }, flat([1, 2, 4, 8])), 'roc')).toEqual([null, null, 300, 300]);
    expect(column(await run('mom', { length: 2 }, flat([1, 2, 4, 8])), 'mom')).toEqual([null, null, 3, 6]);
  });

  it('gives ROC null when the earlier price is zero', async () => {
    expect(column(await run('roc', { length: 1 }, flat([0, 5])), 'roc')).toEqual([null, null]);
  });

  it('puts Aroon at the newest extreme in the length + 1 window', async () => {
    const rows = await run('aroon', { length: 2 }, flat([1, 3, 2, 1, 0]));
    expect(column(rows, 'up')).toEqual([null, null, 50, 0, 0]);
    expect(column(rows, 'down')).toEqual([null, null, 0, 100, 100]);
  });

  it('takes the Donchian bounds and midpoint over the window', async () => {
    const rows = await run('donchian', { length: 2 }, flat([1, 3, 2]));
    expect(column(rows, 'upper')).toEqual([null, 3, 3]);
    expect(column(rows, 'lower')).toEqual([null, 1, 2]);
    expect(column(rows, 'basis')).toEqual([null, 2, 2.5]);
  });

  it('places Williams %R between 0 (at the high) and -100 (at the low) and gives null on a flat window', async () => {
    expect(column(await run('wpr', { length: 3 }, flat([1, 2, 3, 2])), 'pr')).toEqual([null, null, 0, -100]);
    expect(column(await run('wpr', { length: 2 }, flat([5, 5])), 'pr')).toEqual([null, null]);
  });

  it('computes CCI with the 0.015 constant, and null on a flat window', async () => {
    expect(column(await run('cci', { length: 3 }, flat([1, 2, 3])), 'cci')[2]).toBeCloseTo(100, 10);
    expect(column(await run('cci', { length: 2 }, flat([4, 4])), 'cci')).toEqual([null, null]);
  });

  it('computes MFI from positive and negative money flow, the first bar counting on both sides', async () => {
    const value = column(await run('mfi', { length: 3 }, flat([10, 11, 10, 12])), 'mf');
    expect(value.slice(0, 2)).toEqual([null, null]);
    expect(value[2]).toBeCloseTo(100 - 100 / (1 + 21 / 20), 10);
  });

  it('computes CMF from the close location in the bar, 0 for a bar with no range', async () => {
    expect(column(await run('cmf', { length: 1 }, [bar(0, 12, 10, 12, 100)]), 'cmf')).toEqual([1]);
    expect(column(await run('cmf', { length: 1 }, [bar(0, 10, 10, 10, 100)]), 'cmf')).toEqual([0]);
    expect(column(await run('cmf', { length: 1 }, [bar(0, 12, 10, 12, 0)]), 'cmf')).toEqual([null]);
  });

  it('starts DEMA, TEMA and HMA where their inner averages are all defined', async () => {
    const sevens = flat(Array<number>(8).fill(7));
    expect(column(await run('dema', { length: 3 }, sevens), 'dema')).toEqual([null, null, null, null, 7, 7, 7, 7]);
    expect(column(await run('tema', { length: 2 }, sevens), 'tema')).toEqual([null, null, null, 7, 7, 7, 7, 7]);
    expect(column(await run('hma', { length: 4 }, sevens), 'hma')).toEqual([null, null, null, null, 7, 7, 7, 7]);
  });

  it('weights VWMA by volume', async () => {
    const rows = await run('vwma', { length: 2 }, flat([1, 2, 3], [1, 1, 2]));
    expect(column(rows, 'vwma')[2]).toBeCloseTo((2 + 6) / 3, 12);
  });

  it('follows Parabolic SAR: the first trend bar seeds from the prior low, then accelerates toward the extreme', async () => {
    const rows = await run('psar', {}, [bar(0, 10, 9, 9.5), bar(1, 11, 10, 10.5), bar(2, 12, 11, 11.5), bar(3, 13, 12, 12.5)]);
    const [first, second, third, fourth] = column(rows, 'psar');
    expect(first).toBeNull();
    expect(second).toBe(9);
    expect(third).toBe(9);
    expect(fourth).toBeCloseTo(9 + 0.04 * (12 - 9), 12);
  });

  it('flips Parabolic SAR to the extreme point when price crosses it', async () => {
    const rows = await run('psar', {}, [bar(0, 10, 9, 9.5), bar(1, 11, 10, 10.5), bar(2, 12, 11, 11.5), bar(3, 8, 5, 6)]);
    expect(column(rows, 'psar')[3]).toBe(12);
  });

  it('keeps ADX and the DIs null until enough bars have been seen, then within 0..100', async () => {
    const bars = Array.from({ length: 40 }, (_, i) => bar(i * HOUR, 10 + i + (i % 3), 8 + i - (i % 2), 9 + i));
    const rows = await run('dmi', { adxSmoothing: 5, diLength: 5 }, bars);
    expect(column(rows, 'plusDi').findIndex(v => v !== null)).toBe(5);
    expect(column(rows, 'adx').findIndex(v => v !== null)).toBe(9);
    expect(column(rows, 'adx').every(v => v === null || (v >= 0 && v <= 100))).toBe(true);
    expect(column(await run('adx', { adxSmoothing: 5, diLength: 5 }, bars), 'adx')).toEqual(column(rows, 'adx'));
  });

  it('lays the Ichimoku lines out unshifted (the service applies displacement − 1)', async () => {
    const rows = await run('ichimoku', { conversionPeriods: 2, basePeriods: 3, laggingSpan2Periods: 4, displacement: 2 }, flat([1, 3, 2, 6, 4]));
    expect(column(rows, 'conversion')).toEqual([null, 2, 2.5, 4, 5]);
    expect(column(rows, 'base')).toEqual([null, null, 2, 4, 4]);
    expect(column(rows, 'leadA')).toEqual([null, null, 2.25, 4, 4.5]);
    expect(column(rows, 'leadB')).toEqual([null, null, null, 3.5, 4]);
    expect(column(rows, 'lagging')).toEqual([1, 3, 2, 6, 4]);
  });

  it("computes the Keltner bands from the chosen range", async () => {
    const bars = [bar(0, 12, 8, 10), bar(1, 13, 9, 11), bar(2, 14, 10, 12)];
    const rows = await run('kc', { length: 2, exponential: false, bandsStyle: 'Range', mult: 1.5 }, bars);
    expect(column(rows, 'basis')).toEqual([null, 10.5, 11.5]);
    expect(column(rows, 'upper')).toEqual([null, 10.5 + 1.5 * 4, 11.5 + 1.5 * 4]);
    expect(column(rows, 'lower')).toEqual([null, 10.5 - 1.5 * 4, 11.5 - 1.5 * 4]);
  });
});

describe('Pivot Points Standard (Traditional, daily anchor)', () => {
  const day1 = [bar(0, 12, 9, 10), bar(HOUR, 11, 8, 10)];

  it("computes the levels from the previous day's high, low and close", async () => {
    const [first, , next] = await run('pivots', {}, [...day1, bar(24 * HOUR, 20, 19, 19.5)]);
    expect(Object.values(first ?? {}).every(v => v === null)).toBe(true);
    expect(next).toEqual({ r5: 20, r4: 18, r3: 16, r2: 14, r1: 12, p: 10, s1: 8, s2: 6, s3: 4, s4: 2, s5: 0 });
  });

  it('keeps the same levels for every bar of the day and moves them on the next day', async () => {
    const rows = await run('pivots', {}, [...day1, bar(24 * HOUR, 20, 19, 19.5), bar(25 * HOUR, 30, 5, 6), bar(48 * HOUR, 7, 7, 7)]);
    expect(column(rows, 'p')).toEqual([null, null, 10, 10, (30 + 5 + 6) / 3]);
  });

  it('cuts days in the exchange timezone', async () => {
    const bars = [bar(17 * HOUR, 12, 8, 10), bar(19 * HOUR, 11, 9, 10)];
    expect(column(await run('pivots', {}, bars, 'UTC'), 'p')).toEqual([null, null]);
    expect(column(await run('pivots', {}, bars, 'Asia/Kolkata'), 'p')).toEqual([null, 10]);
  });

  it('replaces the forming bar without double counting its high and low', async () => {
    const builtin = findBuiltin('pivots');
    const instance = new NativeRuntime().create({ kind: 'builtin', builtin, inputs: resolveInputs(builtin.definition.inputs, {}) },
      { instrumentId: 'TEST:X', interval: '60', timezone: 'UTC' });
    await instance.seed(day1);
    await instance.update(bar(24 * HOUR, 20, 19, 19.5), false);
    await instance.update(bar(25 * HOUR, 40, 1, 2), false);
    expect((await instance.update(bar(25 * HOUR, 21, 18, 20), true)).p).toBe(10);
  });
});
