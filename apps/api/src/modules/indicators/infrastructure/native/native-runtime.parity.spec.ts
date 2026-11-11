import { describe, expect, it } from 'vitest';
import { findBuiltin } from '../../domain/catalog';
import { resolveInputs } from '../../domain/inputs';
import { NativeRuntime } from './native-runtime';
import { fixtureBars } from './bars.spec-helper';
import { runPine } from './pinets.spec-helper';

const TOLERANCE = 1e-9;
const bars = fixtureBars();
const context = { instrumentId: 'TEST:X', interval: '15' as const, timezone: 'UTC' };

const cases: [id: string, inputs: Record<string, unknown>][] = [
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
];

// FR-IN-2: every native built-in equals its own Pine source on PineTS (TradingView semantics), warm-up bars included.
describe('native runtime parity with PineTS', () => {
  it.each(cases)('%s %j matches on every bar', async (id, raw) => {
    const builtin = findBuiltin(id);
    const inputs = resolveInputs(builtin.definition.inputs, raw);
    const byTitle = Object.fromEntries(builtin.definition.inputs.map(input => [input.title, inputs[input.id]]));
    const native = await new NativeRuntime().create({ kind: 'builtin', builtin, inputs }, context).seed(bars);
    const pine = await runPine(builtin.pine, byTitle, bars, 15 * 60_000);
    for (const plot of builtin.definition.plots) {
      const expected = pine(plot.title);
      expect(expected).toHaveLength(bars.length);
      const mismatches = native.map((row, i) => ({ i, native: row[plot.id] ?? null, pine: expected[i] ?? null }))
        .filter(({ native: a, pine: b }) => (a === null) !== (b === null) || (a !== null && b !== null && Math.abs(a - b) > TOLERANCE * Math.max(1, Math.abs(b))));
      expect(mismatches.slice(0, 3), `${plot.id}: ${String(mismatches.length)} mismatched bars`).toEqual([]);
      const hidden = /^(upper|lower)[23]$/.test(plot.id) && inputs[`showBand${plot.id.slice(-1)}`] === false;
      expect(expected.some(value => value !== null)).toBe(!hidden);
    }
  }, 30_000);
});
