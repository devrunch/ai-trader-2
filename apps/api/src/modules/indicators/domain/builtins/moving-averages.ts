import { boolInput, numberInput } from '../inputs';
import { defineBuiltin, lengthInput, line, offsetInput, recursiveWarmup, sourceInputDef } from './define';

const maPine = (title: string, short: string, fn: string): string => `//@version=6
indicator("${title}", "${short}", overlay = true)
len = input.int(9, "Length", minval = 1)
src = input.source(close, "Source")
offset = input.int(0, "Offset", minval = -500, maxval = 500)
plot(ta.${fn}(src, len), "MA", offset = offset)`;

const inputs = [lengthInput(9), sourceInputDef(), offsetInput];
const windowed = (values: Parameters<typeof numberInput>[0]) => numberInput(values, 'length');

export const SMA = defineBuiltin({ id: 'sma', name: 'Moving Average Simple', shortName: 'SMA', overlay: true, inputs,
  plots: [line('ma', 'MA', 'blue')], pine: maPine('Moving Average Simple', 'SMA', 'sma'), warmup: windowed });
export const EMA = defineBuiltin({ id: 'ema', name: 'Moving Average Exponential', shortName: 'EMA', overlay: true, inputs,
  plots: [line('ma', 'MA', 'blue')], pine: maPine('Moving Average Exponential', 'EMA', 'ema'), warmup: values => recursiveWarmup(numberInput(values, 'length')) });
export const WMA = defineBuiltin({ id: 'wma', name: 'Moving Average Weighted', shortName: 'WMA', overlay: true, inputs,
  plots: [line('ma', 'MA', 'blue')], pine: maPine('Moving Average Weighted', 'WMA', 'wma'), warmup: windowed });

const lengthSource = [lengthInput(9), sourceInputDef()];
const maSource = (title: string, short: string, plot: string, call: string): string => `//@version=6
indicator("${title}", "${short}", overlay = true)
len = input.int(9, "Length", minval = 1)
src = input.source(close, "Source")
${call}
plot(ma, "${plot}")`;

export const HMA = defineBuiltin({ id: 'hma', name: 'Hull Moving Average', shortName: 'HMA', overlay: true, inputs: lengthSource,
  plots: [line('hma', 'HMA', 'blue')], warmup: values => numberInput(values, 'length') + Math.ceil(Math.sqrt(numberInput(values, 'length'))),
  pine: maSource('Hull Moving Average', 'HMA', 'HMA', 'ma = ta.wma(2 * ta.wma(src, math.floor(len / 2)) - ta.wma(src, len), math.round(math.sqrt(len)))') });

export const VWMA = defineBuiltin({ id: 'vwma', name: 'Volume Weighted Moving Average', shortName: 'VWMA', overlay: true,
  inputs: [lengthInput(20), sourceInputDef(), offsetInput], plots: [line('vwma', 'VWMA', 'blue')], warmup: windowed,
  pine: `//@version=6
indicator("Volume Weighted Moving Average", "VWMA", overlay = true)
len = input.int(20, "Length", minval = 1)
src = input.source(close, "Source")
offset = input.int(0, "Offset", minval = -500, maxval = 500)
plot(ta.vwma(src, len), "VWMA", offset = offset)` });

export const DEMA = defineBuiltin({ id: 'dema', name: 'Double Exponential Moving Average', shortName: 'DEMA', overlay: true, inputs: lengthSource,
  plots: [line('dema', 'DEMA', 'blue')], warmup: values => recursiveWarmup(2 * numberInput(values, 'length')),
  pine: maSource('Double Exponential Moving Average', 'DEMA', 'DEMA', `e1 = ta.ema(src, len)
e2 = ta.ema(e1, len)
ma = 2 * e1 - e2`) });

export const TEMA = defineBuiltin({ id: 'tema', name: 'Triple Exponential Moving Average', shortName: 'TEMA', overlay: true, inputs: lengthSource,
  plots: [line('tema', 'TEMA', 'blue')], warmup: values => recursiveWarmup(3 * numberInput(values, 'length')),
  pine: maSource('Triple Exponential Moving Average', 'TEMA', 'TEMA', `e1 = ta.ema(src, len)
e2 = ta.ema(e1, len)
e3 = ta.ema(e2, len)
ma = 3 * (e1 - e2) + e3`) });

export const ENVELOPE = defineBuiltin({ id: 'envelope', name: 'Envelope', shortName: 'Env', overlay: true,
  inputs: [lengthInput(20), { id: 'percent', title: 'Percent', type: 'float', default: 10, min: 0, max: 100, step: 0.1 }, sourceInputDef(),
    { id: 'exponential', title: 'Exponential', type: 'bool', default: false }],
  plots: [line('basis', 'Basis', 'orange'), line('upper', 'Upper', 'blue'), line('lower', 'Lower', 'blue')],
  warmup: values => (boolInput(values, 'exponential') ? recursiveWarmup(numberInput(values, 'length')) : numberInput(values, 'length')),
  pine: `//@version=6
indicator("Envelope", "Env", overlay = true)
length = input.int(20, "Length", minval = 1)
percent = input.float(10.0, "Percent", minval = 0)
src = input.source(close, "Source")
exponential = input.bool(false, "Exponential")
basis = exponential ? ta.ema(src, length) : ta.sma(src, length)
k = percent / 100.0
plot(basis, "Basis")
plot(basis * (1 + k), "Upper")
plot(basis * (1 - k), "Lower")` });

export const LSMA = defineBuiltin({ id: 'lsma', name: 'Least Squares Moving Average', shortName: 'LSMA', overlay: true,
  inputs: [lengthInput(25), { id: 'linregOffset', title: 'Offset', type: 'int', default: 0, min: -500, max: 500 }, sourceInputDef()],
  plots: [line('lsma', 'LSMA', 'yellow')], warmup: windowed,
  pine: `//@version=6
indicator("Least Squares Moving Average", "LSMA", overlay = true)
length = input.int(25, "Length", minval = 1)
offset = input.int(0, "Offset")
src = input.source(close, "Source")
plot(ta.linreg(src, length, offset), "LSMA")` });

export const ALMA = defineBuiltin({ id: 'alma', name: 'Arnaud Legoux Moving Average', shortName: 'ALMA', overlay: true,
  inputs: [{ id: 'length', title: 'Window Size', type: 'int', default: 9, min: 1, max: 5000 },
    { id: 'almaOffset', title: 'Offset', type: 'float', default: 0.85, min: 0, max: 1, step: 0.01 },
    { id: 'sigma', title: 'Sigma', type: 'float', default: 6, min: 0.01, max: 100, step: 0.1 }, sourceInputDef()],
  plots: [line('alma', 'ALMA', 'blue')], warmup: windowed,
  pine: `//@version=6
indicator("Arnaud Legoux Moving Average", "ALMA", overlay = true)
windowsize = input.int(9, "Window Size", minval = 1)
offset = input.float(0.85, "Offset", minval = 0, maxval = 1)
sigma = input.float(6.0, "Sigma", minval = 0.01)
src = input.source(close, "Source")
plot(ta.alma(src, windowsize, offset, sigma), "ALMA")` });

export const SMMA = defineBuiltin({ id: 'smma', name: 'Smoothed Moving Average', shortName: 'SMMA', overlay: true, inputs: [lengthInput(7), sourceInputDef()],
  plots: [line('smma', 'SMMA', 'blue')], warmup: values => recursiveWarmup(numberInput(values, 'length')),
  pine: `//@version=6
indicator("Smoothed Moving Average", "SMMA", overlay = true)
len = input.int(7, "Length", minval = 1)
src = input.source(close, "Source")
plot(ta.rma(src, len), "SMMA")` });

export const MCGINLEY = defineBuiltin({ id: 'mcginley', name: 'McGinley Dynamic', shortName: 'McGinley Dynamic', overlay: true, inputs: [lengthInput(14), sourceInputDef()],
  plots: [line('mg', 'McGinley Dynamic', 'blue')], warmup: values => recursiveWarmup(numberInput(values, 'length')),
  pine: `//@version=6
indicator("McGinley Dynamic", "McGinley Dynamic", overlay = true)
length = input.int(14, "Length", minval = 1)
src = input.source(close, "Source")
mg = 0.0
mg := na(mg[1]) ? ta.ema(src, length) : mg[1] + (src - mg[1]) / (length * math.pow(src / mg[1], 4))
plot(mg, "McGinley Dynamic")` });
