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
