import { describe, expect, it } from 'vitest';
import { findBuiltin } from '../../domain/catalog';
import { resolveInputs } from '../../domain/inputs';
import { NativeRuntime } from './native-runtime';
import { fixtureBars } from './bars.spec-helper';
import { runPine } from './pinets.spec-helper';

const TOLERANCE = 1e-9;
const fixture = fixtureBars();
/** Fixture without the zero-volume bar: PineTS's running SMA never recovers from a division by zero. */
const tradedBars = fixture.map(bar => ({ ...bar, volume: bar.volume || 1 }));
const context = { instrumentId: 'TEST:X', interval: '15' as const, timezone: 'UTC' };

/**
 * `tolerance`: PineTS rounds each `ta.*` result to 10 decimals, which `hv` (×1,900) and `tsi` (a ratio of EMAs of small moves) amplify.
 * `earlyStart`: PineTS's `ta.stoch`/`ta.highest` skip `na` inside a window and start early; TradingView and the native kernel wait for a full window.
 */
interface Options { tolerance?: number; earlyStart?: boolean; tradedBars?: boolean }
const cases: [id: string, inputs: Record<string, unknown>, options?: Options][] = [
  ['sma', {}], ['sma', { length: 20, source: 'hl2' }],
  ['ema', {}], ['ema', { length: 50, source: 'ohlc4' }],
  ['wma', {}], ['wma', { length: 30, source: 'hlc3' }],
  ['rsi', {}], ['rsi', { length: 7, source: 'open' }],
  ['macd', {}], ['macd', { oscillatorMaType: 'SMA', signalMaType: 'SMA' }],
  ['macd', { fastLength: 8, slowLength: 21, signalLength: 5, signalMaType: 'SMA' }],
  ['bb', {}], ['bb', { maType: 'EMA' }], ['bb', { maType: 'SMMA (RMA)' }], ['bb', { maType: 'WMA' }], ['bb', { maType: 'VWMA' }],
  ['bb', { length: 10, mult: 1.5, source: 'hlcc4' }],
  ['atr', {}], ['atr', { smoothing: 'SMA' }], ['atr', { smoothing: 'EMA', length: 5 }], ['atr', { smoothing: 'WMA' }],
  ['stoch', {}], ['stoch', { periodK: 9, smoothK: 3, periodD: 5 }],
  ['vwap', {}], ['vwap', { anchor: 'Week' }], ['vwap', { anchor: 'Month' }], ['vwap', { anchor: 'Quarter' }], ['vwap', { anchor: 'Year' }],
  ['vwap', { bandsMode: 'Percentage', showBand2: true, showBand3: true, source: 'close' }],
  ['supertrend', {}], ['supertrend', { atrPeriod: 7, factor: 2.5 }],
  ['dmi', {}], ['dmi', { adxSmoothing: 7, diLength: 10 }], ['adx', {}],
  ['psar', {}], ['psar', { start: 0.01, increment: 0.03, maximum: 0.3 }],
  ['ichimoku', {}], ['ichimoku', { conversionPeriods: 5, basePeriods: 13, laggingSpan2Periods: 26, displacement: 13 }],
  ['donchian', {}], ['donchian', { length: 7 }],
  ['kc', {}], ['kc', { exponential: false, bandsStyle: 'True Range', mult: 1.5, source: 'hl2' }], ['kc', { bandsStyle: 'Range', length: 10 }],
  ['cci', {}], ['cci', { length: 9, source: 'close' }],
  ['mfi', {}], ['mfi', { length: 7 }], ['obv', {}],
  ['wpr', {}], ['wpr', { length: 5 }], ['roc', {}], ['roc', { length: 3, source: 'hl2' }], ['mom', {}], ['mom', { length: 20, source: 'ohlc4' }],
  ['hma', {}], ['hma', { length: 14, source: 'hlc3' }], ['hma', { length: 2 }], ['vwma', {}], ['vwma', { length: 5, source: 'hl2' }],
  ['dema', {}], ['dema', { length: 20 }], ['tema', {}], ['tema', { length: 20, source: 'hl2' }],
  ['aroon', {}], ['aroon', { length: 5 }], ['cmf', {}], ['cmf', { length: 7 }],
  ['pivots', {}],
  ['stochrsi', {}, { earlyStart: true }], ['stochrsi', { smoothK: 5, smoothD: 2, lengthRsi: 7, lengthStoch: 9, source: 'hl2' }, { earlyStart: true }],
  ['tsi', {}, { tolerance: 1e-7 }], ['tsi', { longLength: 10, shortLength: 5, signalLength: 4, source: 'hlc3' }, { tolerance: 1e-7 }],
  ['uo', {}], ['uo', { fast: 3, middle: 6, slow: 12 }], ['cmo', {}], ['cmo', { length: 20, source: 'hl2' }],
  ['ao', {}], ['dpo', {}], ['dpo', { centered: true }], ['dpo', { centered: true, length: 10 }], ['dpo', { length: 8 }],
  ['ppo', {}], ['ppo', { exponential: true, shortLength: 12, longLength: 26, source: 'hl2' }],
  ['coppock', {}], ['coppock', { length: 5, longRoc: 9, shortRoc: 4, source: 'hlc3' }],
  ['kst', {}], ['kst', { roc1: 3, sma1: 2, roc2: 5, sma2: 3, roc3: 8, sma3: 4, roc4: 13, sma4: 5, signal: 4 }],
  ['bop', {}], ['chaikinosc', {}], ['chaikinosc', { fast: 5, slow: 20 }], ['ad', {}], ['pvt', {}],
  ['eom', {}, { tradedBars: true }], ['eom', { length: 5, divisor: 100 }, { tradedBars: true }], ['efi', {}], ['efi', { length: 3 }],
  ['hv', {}, { tolerance: 1e-6 }], ['hv', { length: 30 }, { tolerance: 1e-6 }],
  ['bbpercentb', {}], ['bbpercentb', { length: 10, mult: 1.5, source: 'hl2' }],
  ['bbw', {}, { earlyStart: true }], ['bbw', { length: 10, expansion: 50, contraction: 30, mult: 3 }, { earlyStart: true }],
  ['envelope', {}], ['envelope', { exponential: true, percent: 2.5, length: 9, source: 'hl2' }],
  ['lsma', {}], ['lsma', { length: 10, linregOffset: 3, source: 'hlc3' }], ['lsma', { length: 5, linregOffset: -2 }],
  ['alma', {}], ['alma', { length: 20, almaOffset: 0.5, sigma: 3, source: 'hl2' }],
  ['smma', {}], ['smma', { length: 30, source: 'hlc3' }],
  ['mcginley', {}], ['mcginley', { length: 5, source: 'hl2' }],
  ['volosc', {}], ['volosc', { shortLength: 3, longLength: 20 }],
];

// FR-IN-2: every native built-in equals its own Pine source on PineTS (TradingView semantics), warm-up bars included.
describe('native runtime parity with PineTS', () => {
  it.each(cases)('%s %j matches on every bar', async (id, raw, options = {}) => {
    const bars = options.tradedBars ? tradedBars : fixture;
    const tolerance = options.tolerance ?? TOLERANCE;
    const builtin = findBuiltin(id);
    const inputs = resolveInputs(builtin.definition.inputs, raw);
    const byTitle = Object.fromEntries(builtin.definition.inputs.map(input => [input.title, inputs[input.id]]));
    const native = await new NativeRuntime().create({ kind: 'builtin', builtin, inputs }, context).seed(bars);
    const pine = await runPine(builtin.pine, byTitle, bars, 15 * 60_000);
    for (const plot of builtin.definition.plots) {
      const expected = pine(plot.title);
      expect(expected).toHaveLength(bars.length);
      const mismatches = native.map((row, i) => ({ i, native: row[plot.id] ?? null, pine: expected[i] ?? null }))
        .filter(({ native: a, pine: b }) => (a === null) !== (b === null) ? !(options.earlyStart && a === null) : a !== null && b !== null && Math.abs(a - b) > tolerance * Math.max(1, Math.abs(b)));
      expect(mismatches.slice(0, 3), `${plot.id}: ${String(mismatches.length)} mismatched bars`).toEqual([]);
      const hidden = /^(upper|lower)[23]$/.test(plot.id) && inputs[`showBand${plot.id.slice(-1)}`] === false;
      expect(expected.some(value => value !== null)).toBe(!hidden);
    }
  }, 30_000);
});
