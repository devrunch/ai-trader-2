import { describe, expect, it } from 'vitest';
import type { Bar, Interval } from '@aitrader/contracts';
import { findBuiltin } from '../../domain/catalog';
import { resolveInputs } from '../../domain/inputs';
import { NativeRuntime } from './native-runtime';

const HOUR = 3_600_000;
const run = async (id: string, raw: Record<string, unknown>, bars: Bar[], interval: Interval = '60') => {
  const builtin = findBuiltin(id);
  const instance = new NativeRuntime().create({ kind: 'builtin', builtin, inputs: resolveInputs(builtin.definition.inputs, raw) },
    { instrumentId: 'TEST:X', interval, timezone: 'UTC' });
  return instance.seed(bars);
};
const column = async (id: string, raw: Record<string, unknown>, bars: Bar[], plot = id, interval: Interval = '60') =>
  (await run(id, raw, bars, interval)).map(row => row[plot] ?? null);
const bar = (i: number, high: number, low: number, close: number, volume = 1, open = close): Bar => ({ time: i * HOUR, open, high, low, close, volume });
const flat = (closes: number[], volumes?: number[]): Bar[] => closes.map((close, i) => bar(i, close, close, close, volumes?.[i] ?? 1));
const firstDefined = (values: (number | null)[]): number => values.findIndex(value => value !== null);
const ramp = (count: number): Bar[] => flat(Array.from({ length: count }, (_, i) => 100 + i + (i % 3)));

// FR-IN-2, FR-IN-7: hand-checked values for the P4-13b built-ins, independent of the Pine parity run.
describe('P4-13b native built-ins', () => {
  it('starts Stochastic RSI and TSI once every smoothing stage has a value', async () => {
    const stoch = await run('stochrsi', {}, ramp(60));
    expect(firstDefined(stoch.map(row => row.k ?? null))).toBe(29);
    expect(firstDefined(stoch.map(row => row.d ?? null))).toBe(31);
    const tsi = await run('tsi', {}, ramp(80));
    expect(firstDefined(tsi.map(row => row.tsi ?? null))).toBe(37);
    expect(firstDefined(tsi.map(row => row.signal ?? null))).toBe(49);
  });

  it('keeps TSI at 100 when price only rises', async () => {
    const values = await column('tsi', { longLength: 3, shortLength: 2, signalLength: 2 }, flat([1, 2, 4, 5, 7, 8, 10, 11]), 'tsi');
    expect(values.at(-1)).toBeCloseTo(100, 10);
  });

  it('weights the Ultimate Oscillator 4:2:1 and leaves the first bar null', async () => {
    expect(await column('uo', { fast: 1, middle: 1, slow: 1 }, flat([10, 12]), 'uo')).toEqual([null, 100]);
    const bars = [bar(0, 10, 10, 10), bar(1, 14, 9, 12), bar(2, 13, 11, 12)];
    // bp = [3, 1], tr = [5, 2]: fast = 1/2, middle = slow = 4/7.
    const [, , value] = await column('uo', { fast: 1, middle: 2, slow: 2 }, bars, 'uo');
    expect(value).toBeCloseTo(100 * (4 * 0.5 + 2 * (4 / 7) + 4 / 7) / 7, 12);
  });

  it('puts Chande MO at 100 on gains only, 0 when gains equal losses, and null on no movement', async () => {
    expect(await column('cmo', { length: 2 }, flat([1, 2, 3]), 'cmo')).toEqual([null, null, 100]);
    expect(await column('cmo', { length: 2 }, flat([1, 2, 1]), 'cmo')).toEqual([null, null, 0]);
    expect(await column('cmo', { length: 2 }, flat([5, 5, 5]), 'cmo')).toEqual([null, null, null]);
  });

  it('computes the Awesome Oscillator from 5- and 34-bar averages of hl2', async () => {
    const values = await column('ao', {}, flat(Array.from({ length: 34 }, (_, i) => i + 1)), 'ao');
    expect(firstDefined(values)).toBe(33);
    expect(values[33]).toBeCloseTo(32 - 17.5, 12);
  });

  it('shifts the DPO average back by half the period plus one, or the close when centred', async () => {
    const bars = flat([1, 2, 3, 4, 5, 6]);
    expect(await column('dpo', { length: 2 }, bars, 'dpo')).toEqual([null, null, null, 2.5, 2.5, 2.5]);
    expect(await column('dpo', { length: 2, centered: true }, bars, 'dpo')).toEqual([null, null, -1.5, -1.5, -1.5, -1.5]);
  });

  it('computes PPO as the percent gap between the short and long averages', async () => {
    const [, value] = await column('ppo', { shortLength: 1, longLength: 2 }, flat([2, 4]), 'ppo');
    expect(value).toBeCloseTo(100 / 3, 12);
  });

  it('starts Coppock and KST where every inner average is defined', async () => {
    expect(firstDefined(await column('coppock', { length: 2, longRoc: 3, shortRoc: 2 }, ramp(10), 'coppock'))).toBe(4);
    const kst = await run('kst', { roc1: 1, sma1: 1, roc2: 2, sma2: 1, roc3: 3, sma3: 1, roc4: 4, sma4: 1, signal: 2 }, ramp(10));
    expect(firstDefined(kst.map(row => row.kst ?? null))).toBe(4);
    expect(firstDefined(kst.map(row => row.signal ?? null))).toBe(5);
  });

  it('computes Balance of Power, null on a bar with no range', async () => {
    const bars = [bar(0, 12, 8, 11, 1, 9), bar(1, 10, 10, 10)];
    expect(await column('bop', {}, bars)).toEqual([0.5, null]);
  });

  it('accumulates A/D and PVT from the close location and the percent change', async () => {
    expect(await column('ad', {}, [bar(0, 12, 10, 12, 100), bar(1, 12, 10, 10, 50), bar(2, 5, 5, 5, 9)])).toEqual([100, 50, 50]);
    const pvt = await column('pvt', {}, flat([10, 11, 11], [1, 5, 7]));
    expect(pvt[0]).toBeNull();
    expect(pvt[1]).toBeCloseTo(0.5, 12);
    expect(pvt[2]).toBeCloseTo(0.5, 12);
  });

  it('takes the Chaikin Oscillator as fast minus slow EMA of A/D', async () => {
    const values = await column('chaikinosc', { fast: 1, slow: 2 }, [bar(0, 12, 10, 12, 100), bar(1, 12, 10, 10, 50)], 'osc');
    expect(values).toEqual([null, -25]);
  });

  it('computes Ease of Movement and lets a zero-volume bar blank its window only', async () => {
    const bars = [bar(0, 12, 8, 10, 50), bar(1, 14, 10, 12, 50), bar(2, 16, 12, 14, 0), bar(3, 18, 14, 16, 50)];
    expect(await column('eom', { length: 1, divisor: 100 }, bars)).toEqual([null, 16, null, 16]);
    expect(await column('eom', { length: 2, divisor: 100 }, bars)).toEqual([null, null, null, null]);
  });

  it("computes Elder's Force Index as the EMA of the close change times volume", async () => {
    expect(await column('efi', { length: 1 }, flat([10, 12, 11], [1, 3, 4]))).toEqual([null, 6, -4]);
  });

  it('annualises Historical Volatility over 365 days, or 52 weeks for weekly bars', async () => {
    const bars = flat([1, Math.E, 1]);
    const daily = (await column('hv', { length: 2 }, bars, 'hv', '60')).at(-1);
    expect(daily).toBeCloseTo(100 * Math.sqrt(365), 8);
    expect((await column('hv', { length: 2 }, bars, 'hv', '1W')).at(-1)).toBeCloseTo(100 * Math.sqrt(365 / 7), 8);
    expect(await column('hv', { length: 2 }, bars.slice(0, 2), 'hv')).toEqual([null, null]);
  });

  it('locates the close inside the Bollinger bands (%B) and measures their width relative to the basis', async () => {
    expect(await column('bbpercentb', { length: 2 }, flat([1, 3]), 'percentB')).toEqual([null, 0.75]);
    expect(await column('bbpercentb', { length: 2 }, flat([2, 2]), 'percentB')).toEqual([null, null]);
    const width = await run('bbw', { length: 2, expansion: 2, contraction: 2 }, flat([1, 3, 3]));
    expect(width.map(row => row.bbw ?? null)).toEqual([null, 2, 0]);
    expect(width.map(row => row.highest ?? null)).toEqual([null, null, 2]);
    expect(width.map(row => row.lowest ?? null)).toEqual([null, null, 0]);
  });

  it('puts the Envelope bounds a percent either side of the basis', async () => {
    const rows = await run('envelope', { length: 2, percent: 10 }, flat([10, 20]));
    expect(rows[1]?.basis).toBe(15);
    expect(rows[1]?.upper).toBeCloseTo(16.5, 12);
    expect(rows[1]?.lower).toBeCloseTo(13.5, 12);
  });

  it('reads the least-squares line at the newest bar, or `offset` bars before it', async () => {
    expect(await column('lsma', { length: 3 }, flat([1, 2, 3]), 'lsma')).toEqual([null, null, 3]);
    expect((await column('lsma', { length: 3, linregOffset: 1 }, flat([1, 2, 3]), 'lsma'))[2]).toBeCloseTo(2, 12);
    expect((await column('lsma', { length: 3 }, flat([1, 3, 2]), 'lsma'))[2]).toBeCloseTo(2.5, 12);
    expect(await column('lsma', { length: 1 }, flat([4, 5]), 'lsma')).toEqual([4, 5]);
  });

  it('weights ALMA by a Gaussian around offset × (length − 1)', async () => {
    const edge = Math.exp(-2);
    const [, , value] = await column('alma', { length: 3, almaOffset: 0.5, sigma: 6 }, flat([1, 2, 4]), 'alma');
    expect(value).toBeCloseTo((edge * 1 + 2 + edge * 4) / (1 + 2 * edge), 12);
  });

  it('smooths SMMA from an SMA seed with alpha 1/length', async () => {
    expect(await column('smma', { length: 3 }, flat([3, 6, 9, 12]), 'smma')).toEqual([null, null, 6, 8]);
  });

  it('moves McGinley Dynamic from the EMA seed by (src − mg) / (length × (src / mg)⁴)', async () => {
    const values = await column('mcginley', { length: 2 }, flat([1, 3, 3]), 'mg');
    expect(values[0]).toBeNull();
    expect(values[1]).toBe(2);
    expect(values[2]).toBeCloseTo(2 + 1 / (2 * 1.5 ** 4), 12);
  });

  it('takes the Volume Oscillator as the percent gap between two volume EMAs', async () => {
    expect(await column('volosc', { shortLength: 1, longLength: 2 }, flat([1, 1], [10, 30]), 'osc')).toEqual([null, 50]);
  });
});
