import { numberInput } from '../inputs';
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
