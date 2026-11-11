import { boolInput, numberInput } from '../inputs';
import { defineBuiltin, lengthInput, line, recursiveWarmup, sourceInputDef } from './define';

type Values = Parameters<typeof numberInput>[0];
const sum = (values: Values, ...ids: string[]): number => ids.reduce((total, id) => total + numberInput(values, id), 0);
const int = (id: string, title: string, fallback: number, max = 5000) => ({ id, title, type: 'int' as const, default: fallback, min: 1, max });
const zero = [{ id: 'zero', title: 'Zero Line', value: 0 }];
const header = (title: string, short: string): string => `//@version=6\nindicator("${title}", "${short}")`;

export const STOCH_RSI = defineBuiltin({
  id: 'stochrsi', name: 'Stochastic RSI', shortName: 'Stoch RSI', overlay: false,
  inputs: [int('smoothK', 'K', 3), int('smoothD', 'D', 3), int('lengthRsi', 'RSI Length', 14), int('lengthStoch', 'Stochastic Length', 14),
    { id: 'source', title: 'RSI Source', type: 'source', default: 'close' }],
  plots: [line('k', 'K', 'blue'), line('d', 'D', 'orange')],
  levels: [{ id: 'upper', title: 'Upper Band', value: 80 }, { id: 'middle', title: 'Middle Band', value: 50 }, { id: 'lower', title: 'Lower Band', value: 20 }],
  warmup: values => recursiveWarmup(numberInput(values, 'lengthRsi')) + sum(values, 'lengthStoch', 'smoothK', 'smoothD'),
  pine: `${header('Stochastic RSI', 'Stoch RSI')}
smoothK = input.int(3, "K", minval = 1)
smoothD = input.int(3, "D", minval = 1)
lengthRSI = input.int(14, "RSI Length", minval = 1)
lengthStoch = input.int(14, "Stochastic Length", minval = 1)
src = input.source(close, "RSI Source")
rsi1 = ta.rsi(src, lengthRSI)
k = ta.sma(ta.stoch(rsi1, rsi1, rsi1, lengthStoch), smoothK)
d = ta.sma(k, smoothD)
plot(k, "K")
plot(d, "D")`,
});

export const TSI = defineBuiltin({
  id: 'tsi', name: 'True Strength Index', shortName: 'TSI', overlay: false,
  inputs: [int('longLength', 'Long Length', 25), int('shortLength', 'Short Length', 13), int('signalLength', 'Signal Length', 13), sourceInputDef()],
  plots: [line('tsi', 'True Strength Index', 'blue'), line('signal', 'Signal', 'orange')], levels: zero,
  warmup: values => recursiveWarmup(sum(values, 'longLength', 'shortLength', 'signalLength')),
  pine: `${header('True Strength Index', 'TSI')}
long = input.int(25, "Long Length", minval = 1)
short = input.int(13, "Short Length", minval = 1)
signal = input.int(13, "Signal Length", minval = 1)
src = input.source(close, "Source")
pc = src - src[1]
double_smoothed_pc = ta.ema(ta.ema(pc, long), short)
double_smoothed_abs_pc = ta.ema(ta.ema(math.abs(pc), long), short)
tsi_value = 100 * (double_smoothed_pc / double_smoothed_abs_pc)
plot(tsi_value, "True Strength Index")
plot(ta.ema(tsi_value, signal), "Signal")`,
});

export const ULTIMATE = defineBuiltin({
  id: 'uo', name: 'Ultimate Oscillator', shortName: 'UO', overlay: false,
  inputs: [int('fast', 'Fast Length', 7), int('middle', 'Middle Length', 14), int('slow', 'Slow Length', 28)],
  plots: [line('uo', 'Ultimate Oscillator', 'red')],
  warmup: values => Math.max(numberInput(values, 'fast'), numberInput(values, 'middle'), numberInput(values, 'slow')) + 1,
  pine: `${header('Ultimate Oscillator', 'UO')}
fast = input.int(7, "Fast Length", minval = 1)
middle = input.int(14, "Middle Length", minval = 1)
slow = input.int(28, "Slow Length", minval = 1)
high_ = math.max(high, close[1])
low_ = math.min(low, close[1])
bp = close - low_
tr_ = high_ - low_
avg7 = math.sum(bp, fast) / math.sum(tr_, fast)
avg14 = math.sum(bp, middle) / math.sum(tr_, middle)
avg28 = math.sum(bp, slow) / math.sum(tr_, slow)
plot(100 * (4 * avg7 + 2 * avg14 + avg28) / 7, "Ultimate Oscillator")`,
});

export const CMO = defineBuiltin({
  id: 'cmo', name: 'Chande Momentum Oscillator', shortName: 'ChandeMO', overlay: false,
  inputs: [lengthInput(9), sourceInputDef()], plots: [line('cmo', 'Chande MO', 'blue')], levels: zero,
  warmup: values => numberInput(values, 'length') + 1,
  pine: `${header('Chande Momentum Oscillator', 'ChandeMO')}
length = input.int(9, "Length", minval = 1)
src = input.source(close, "Source")
momm = src - src[1]
m1 = momm >= 0.0 ? momm : 0.0
m2 = momm >= 0.0 ? 0.0 : -momm
sm1 = math.sum(m1, length)
sm2 = math.sum(m2, length)
plot(100 * (sm1 - sm2) / (sm1 + sm2), "Chande MO")`,
});

export const AWESOME = defineBuiltin({
  id: 'ao', name: 'Awesome Oscillator', shortName: 'AO', overlay: false, inputs: [],
  plots: [{ id: 'ao', title: 'AO', kind: 'histogram', color: 'green', lineWidth: 1 }], levels: zero,
  warmup: () => 34,
  pine: `${header('Awesome Oscillator', 'AO')}
plot(ta.sma(hl2, 5) - ta.sma(hl2, 34), "AO", style = plot.style_columns)`,
});

const barsBack = (length: number): number => Math.floor(length / 2) + 1;
export const DPO = defineBuiltin({
  id: 'dpo', name: 'Detrended Price Oscillator', shortName: 'DPO', overlay: false,
  inputs: [lengthInput(21, 'Period'), { id: 'centered', title: 'Centered', type: 'bool', default: false }],
  plots: [line('dpo', 'DPO', 'green')], levels: zero,
  warmup: values => numberInput(values, 'length') + barsBack(numberInput(values, 'length')),
  plotOffsets: values => ({ dpo: boolInput(values, 'centered') ? -barsBack(numberInput(values, 'length')) : 0 }),
  pine: `${header('Detrended Price Oscillator', 'DPO')}
length = input.int(21, "Period", minval = 1)
centered = input.bool(false, "Centered")
barsback = math.floor(length / 2) + 1
ma = ta.sma(close, length)
dpo = centered ? close[barsback] - ma : close - ma[barsback]
plot(dpo, "DPO", offset = centered ? -barsback : 0)`,
});

export const PPO = defineBuiltin({
  id: 'ppo', name: 'Price Oscillator', shortName: 'PPO', overlay: false,
  inputs: [int('shortLength', 'Short Length', 10), int('longLength', 'Long Length', 21), sourceInputDef(), { id: 'exponential', title: 'Exponential', type: 'bool', default: false }],
  plots: [line('ppo', 'PPO', 'blue')], levels: zero,
  warmup: values => { const longest = Math.max(numberInput(values, 'shortLength'), numberInput(values, 'longLength')); return boolInput(values, 'exponential') ? recursiveWarmup(longest) : longest; },
  pine: `${header('Price Oscillator', 'PPO')}
shortlen = input.int(10, "Short Length", minval = 1)
longlen = input.int(21, "Long Length", minval = 1)
src = input.source(close, "Source")
exponential = input.bool(false, "Exponential")
short = exponential ? ta.ema(src, shortlen) : ta.sma(src, shortlen)
long = exponential ? ta.ema(src, longlen) : ta.sma(src, longlen)
plot((short - long) / long * 100, "PPO")`,
});

export const COPPOCK = defineBuiltin({
  id: 'coppock', name: 'Coppock Curve', shortName: 'Coppock Curve', overlay: false,
  inputs: [int('length', 'WMA Length', 10), int('longRoc', 'Long RoC Length', 14), int('shortRoc', 'Short RoC Length', 11), sourceInputDef()],
  plots: [line('coppock', 'Coppock Curve', 'blue')], levels: zero,
  warmup: values => sum(values, 'length') + Math.max(numberInput(values, 'longRoc'), numberInput(values, 'shortRoc')),
  pine: `${header('Coppock Curve', 'Coppock Curve')}
wmaLength = input.int(10, "WMA Length", minval = 1)
longRoCLength = input.int(14, "Long RoC Length", minval = 1)
shortRoCLength = input.int(11, "Short RoC Length", minval = 1)
src = input.source(close, "Source")
plot(ta.wma(ta.roc(src, longRoCLength) + ta.roc(src, shortRoCLength), wmaLength), "Coppock Curve")`,
});

const KST_ROC = [10, 15, 20, 30];
const KST_SMA = [10, 10, 10, 15];
export const KST = defineBuiltin({
  id: 'kst', name: 'Know Sure Thing', shortName: 'KST', overlay: false,
  inputs: [...KST_ROC.flatMap((roc, i) => [int(`roc${String(i + 1)}`, `ROC Length #${String(i + 1)}`, roc), int(`sma${String(i + 1)}`, `SMA Length #${String(i + 1)}`, KST_SMA[i] ?? 10)]),
    int('signal', 'Signal Line Length', 9)],
  plots: [line('kst', 'KST', 'green'), line('signal', 'Signal', 'red')], levels: zero,
  warmup: values => Math.max(...[1, 2, 3, 4].map(i => sum(values, `roc${String(i)}`, `sma${String(i)}`))) + numberInput(values, 'signal'),
  pine: `${header('Know Sure Thing', 'KST')}
roclen1 = input.int(10, "ROC Length #1", minval = 1)
smalen1 = input.int(10, "SMA Length #1", minval = 1)
roclen2 = input.int(15, "ROC Length #2", minval = 1)
smalen2 = input.int(10, "SMA Length #2", minval = 1)
roclen3 = input.int(20, "ROC Length #3", minval = 1)
smalen3 = input.int(10, "SMA Length #3", minval = 1)
roclen4 = input.int(30, "ROC Length #4", minval = 1)
smalen4 = input.int(15, "SMA Length #4", minval = 1)
siglen = input.int(9, "Signal Line Length", minval = 1)
smaroc(roclen, smalen) => ta.sma(ta.roc(close, roclen), smalen)
kst = smaroc(roclen1, smalen1) + 2 * smaroc(roclen2, smalen2) + 3 * smaroc(roclen3, smalen3) + 4 * smaroc(roclen4, smalen4)
plot(kst, "KST")
plot(ta.sma(kst, siglen), "Signal")`,
});

export const BOP = defineBuiltin({
  id: 'bop', name: 'Balance of Power', shortName: 'BoP', overlay: false, inputs: [],
  plots: [line('bop', 'Balance Of Power', 'blue')], levels: zero, warmup: () => 0,
  pine: `${header('Balance of Power', 'BoP')}
plot((close - open) / (high - low), "Balance Of Power")`,
});

export const VOLUME_OSCILLATOR = defineBuiltin({
  id: 'volosc', name: 'Volume Oscillator', shortName: 'Volume Osc', overlay: false,
  inputs: [int('shortLength', 'Short Length', 5), int('longLength', 'Long Length', 10)],
  plots: [line('osc', 'OSC', 'blue')], levels: zero,
  warmup: values => recursiveWarmup(Math.max(numberInput(values, 'shortLength'), numberInput(values, 'longLength'))),
  pine: `${header('Volume Oscillator', 'Volume Osc')}
shortlen = input.int(5, "Short Length", minval = 1)
longlen = input.int(10, "Long Length", minval = 1)
short = ta.ema(volume, shortlen)
long = ta.ema(volume, longlen)
plot(100 * (short - long) / long, "OSC")`,
});
