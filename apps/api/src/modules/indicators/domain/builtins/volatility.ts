import { numberInput, stringInput } from '../inputs';
import { defineBuiltin, lengthInput, line, offsetInput, recursiveWarmup, sourceInputDef } from './define';

export const BB_MA_TYPES = ['SMA', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA'];
export const BB = defineBuiltin({
  id: 'bb', name: 'Bollinger Bands', shortName: 'BB', overlay: true,
  inputs: [
    lengthInput(20), { id: 'maType', title: 'Basis MA Type', type: 'string', default: 'SMA', options: BB_MA_TYPES }, sourceInputDef(),
    { id: 'mult', title: 'StdDev', type: 'float', default: 2, min: 0.001, max: 50, step: 0.1 }, offsetInput,
  ],
  plots: [line('basis', 'Basis', 'orange'), line('upper', 'Upper', 'blue'), line('lower', 'Lower', 'blue')],
  warmup: values => {
    const length = numberInput(values, 'length');
    return ['EMA', 'SMMA (RMA)'].includes(stringInput(values, 'maType')) ? recursiveWarmup(length) : length;
  },
  pine: `//@version=6
indicator("Bollinger Bands", "BB", overlay = true)
length = input.int(20, "Length", minval = 1)
maType = input.string("SMA", "Basis MA Type", options = ["SMA", "EMA", "SMMA (RMA)", "WMA", "VWMA"])
src = input.source(close, "Source")
mult = input.float(2.0, "StdDev", minval = 0.001, maxval = 50)
offset = input.int(0, "Offset", minval = -500, maxval = 500)
basis = maType == "SMA" ? ta.sma(src, length) : maType == "EMA" ? ta.ema(src, length) : maType == "SMMA (RMA)" ? ta.rma(src, length) : maType == "WMA" ? ta.wma(src, length) : ta.vwma(src, length)
dev = mult * ta.stdev(src, length)
plot(basis, "Basis", offset = offset)
plot(basis + dev, "Upper", offset = offset)
plot(basis - dev, "Lower", offset = offset)`,
});

export const ATR_SMOOTHINGS = ['RMA', 'SMA', 'EMA', 'WMA'];
export const ATR = defineBuiltin({
  id: 'atr', name: 'Average True Range', shortName: 'ATR', overlay: false,
  inputs: [lengthInput(14), { id: 'smoothing', title: 'Smoothing', type: 'string', default: 'RMA', options: ATR_SMOOTHINGS }],
  plots: [line('atr', 'ATR', 'red')],
  warmup: values => {
    const length = numberInput(values, 'length');
    return ['RMA', 'EMA'].includes(stringInput(values, 'smoothing')) ? recursiveWarmup(length) : length + 1;
  },
  pine: `//@version=6
indicator("Average True Range", "ATR")
length = input.int(14, "Length", minval = 1)
smoothing = input.string("RMA", "Smoothing", options = ["RMA", "SMA", "EMA", "WMA"])
tr = ta.tr(true)
plot(smoothing == "RMA" ? ta.rma(tr, length) : smoothing == "SMA" ? ta.sma(tr, length) : smoothing == "EMA" ? ta.ema(tr, length) : ta.wma(tr, length), "ATR")`,
});

export const SUPERTREND = defineBuiltin({
  id: 'supertrend', name: 'Supertrend', shortName: 'Supertrend', overlay: true,
  inputs: [
    { id: 'atrPeriod', title: 'ATR Length', type: 'int', default: 10, min: 1, max: 5000 },
    { id: 'factor', title: 'Factor', type: 'float', default: 3, min: 0.01, max: 100, step: 0.01 },
  ],
  plots: [line('up', 'Up Trend', 'green'), line('down', 'Down Trend', 'red')],
  warmup: values => recursiveWarmup(numberInput(values, 'atrPeriod')),
  pine: `//@version=6
indicator("Supertrend", overlay = true)
atrPeriod = input.int(10, "ATR Length", minval = 1)
factor = input.float(3.0, "Factor", minval = 0.01, step = 0.01)
[supertrend, direction] = ta.supertrend(factor, atrPeriod)
plot(direction < 0 ? supertrend : na, "Up Trend")
plot(direction < 0 ? na : supertrend, "Down Trend")`,
});
