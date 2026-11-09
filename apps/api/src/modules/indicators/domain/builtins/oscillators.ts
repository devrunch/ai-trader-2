import { numberInput, stringInput } from '../inputs';
import { defineBuiltin, lengthInput, line, recursiveWarmup, sourceInputDef } from './define';

const bands = (upper: number, lower: number) => [
  { id: 'upper', title: 'Upper Band', value: upper }, { id: 'middle', title: 'Middle Band', value: 50 }, { id: 'lower', title: 'Lower Band', value: lower },
];

export const RSI = defineBuiltin({
  id: 'rsi', name: 'Relative Strength Index', shortName: 'RSI', overlay: false,
  inputs: [lengthInput(14, 'RSI Length'), sourceInputDef()],
  plots: [line('rsi', 'RSI', 'violet')], levels: bands(70, 30),
  warmup: values => recursiveWarmup(numberInput(values, 'length')),
  pine: `//@version=6
indicator("Relative Strength Index", "RSI")
len = input.int(14, "RSI Length", minval = 1)
src = input.source(close, "Source")
plot(ta.rsi(src, len), "RSI")`,
});

const maTypes = ['SMA', 'EMA'];
export const MACD = defineBuiltin({
  id: 'macd', name: 'Moving Average Convergence Divergence', shortName: 'MACD', overlay: false,
  inputs: [
    { id: 'fastLength', title: 'Fast Length', type: 'int', default: 12, min: 1, max: 5000 },
    { id: 'slowLength', title: 'Slow Length', type: 'int', default: 26, min: 1, max: 5000 },
    sourceInputDef(),
    { id: 'signalLength', title: 'Signal Smoothing', type: 'int', default: 9, min: 1, max: 50 },
    { id: 'oscillatorMaType', title: 'Oscillator MA Type', type: 'string', default: 'EMA', options: maTypes },
    { id: 'signalMaType', title: 'Signal Line MA Type', type: 'string', default: 'EMA', options: maTypes },
  ],
  plots: [{ id: 'histogram', title: 'Histogram', kind: 'histogram', color: 'teal', lineWidth: 1 }, line('macd', 'MACD', 'blue'), line('signal', 'Signal', 'orange')],
  levels: [{ id: 'zero', title: 'Zero Line', value: 0 }],
  warmup: values => {
    const slow = Math.max(numberInput(values, 'fastLength'), numberInput(values, 'slowLength'));
    const signal = numberInput(values, 'signalLength');
    const recursive = stringInput(values, 'oscillatorMaType') === 'EMA' || stringInput(values, 'signalMaType') === 'EMA';
    return recursive ? recursiveWarmup(slow + signal) : slow + signal;
  },
  pine: `//@version=6
indicator("Moving Average Convergence Divergence", "MACD")
fast_length = input.int(12, "Fast Length", minval = 1)
slow_length = input.int(26, "Slow Length", minval = 1)
src = input.source(close, "Source")
signal_length = input.int(9, "Signal Smoothing", minval = 1, maxval = 50)
sma_source = input.string("EMA", "Oscillator MA Type", options = ["SMA", "EMA"])
sma_signal = input.string("EMA", "Signal Line MA Type", options = ["SMA", "EMA"])
fast_ma = sma_source == "SMA" ? ta.sma(src, fast_length) : ta.ema(src, fast_length)
slow_ma = sma_source == "SMA" ? ta.sma(src, slow_length) : ta.ema(src, slow_length)
macd = fast_ma - slow_ma
signal = sma_signal == "SMA" ? ta.sma(macd, signal_length) : ta.ema(macd, signal_length)
hist = macd - signal
plot(hist, "Histogram", style = plot.style_columns)
plot(macd, "MACD")
plot(signal, "Signal")`,
});

export const STOCH = defineBuiltin({
  id: 'stoch', name: 'Stochastic', shortName: 'Stoch', overlay: false,
  inputs: [
    { id: 'periodK', title: '%K Length', type: 'int', default: 14, min: 1, max: 5000 },
    { id: 'smoothK', title: '%K Smoothing', type: 'int', default: 1, min: 1, max: 5000 },
    { id: 'periodD', title: '%D Smoothing', type: 'int', default: 3, min: 1, max: 5000 },
  ],
  plots: [line('k', '%K', 'blue'), line('d', '%D', 'orange')], levels: bands(80, 20),
  warmup: values => numberInput(values, 'periodK') + numberInput(values, 'smoothK') + numberInput(values, 'periodD'),
  pine: `//@version=6
indicator("Stochastic", "Stoch")
periodK = input.int(14, "%K Length", minval = 1)
smoothK = input.int(1, "%K Smoothing", minval = 1)
periodD = input.int(3, "%D Smoothing", minval = 1)
k = ta.sma(ta.stoch(close, high, low, periodK), smoothK)
d = ta.sma(k, periodD)
plot(k, "%K")
plot(d, "%D")`,
});
