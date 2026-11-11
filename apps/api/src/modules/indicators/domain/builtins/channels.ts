import { numberInput, stringInput } from '../inputs';
import { defineBuiltin, lengthInput, line, recursiveWarmup, sourceInputDef } from './define';

export const DONCHIAN = defineBuiltin({
  id: 'donchian', name: 'Donchian Channels', shortName: 'DC', overlay: true, inputs: [lengthInput(20)],
  plots: [line('basis', 'Basis', 'orange'), line('upper', 'Upper', 'blue'), line('lower', 'Lower', 'blue')],
  warmup: values => numberInput(values, 'length'),
  pine: `//@version=6
indicator("Donchian Channels", "DC", overlay = true)
length = input.int(20, "Length", minval = 1)
lower = ta.lowest(length)
upper = ta.highest(length)
plot(math.avg(upper, lower), "Basis")
plot(upper, "Upper")
plot(lower, "Lower")`,
});

const BANDS_STYLES = ['Average True Range', 'True Range', 'Range'];
export const KELTNER = defineBuiltin({
  id: 'kc', name: 'Keltner Channels', shortName: 'KC', overlay: true,
  inputs: [
    lengthInput(20), { id: 'mult', title: 'Multiplier', type: 'float', default: 2, min: 0, max: 50, step: 0.1 }, sourceInputDef(),
    { id: 'exponential', title: 'Use Exponential MA', type: 'bool', default: true },
    { id: 'bandsStyle', title: 'Bands Style', type: 'string', default: 'Average True Range', options: BANDS_STYLES },
    { id: 'atrLength', title: 'ATR Length', type: 'int', default: 10, min: 1, max: 5000 },
  ],
  plots: [line('basis', 'Basis', 'blue'), line('upper', 'Upper', 'blue'), line('lower', 'Lower', 'blue')],
  warmup: values => recursiveWarmup(Math.max(numberInput(values, 'length'), stringInput(values, 'bandsStyle') === 'Average True Range' ? numberInput(values, 'atrLength') : 1)),
  pine: `//@version=6
indicator("Keltner Channels", "KC", overlay = true)
length = input.int(20, "Length", minval = 1)
mult = input.float(2.0, "Multiplier", minval = 0)
src = input.source(close, "Source")
useExp = input.bool(true, "Use Exponential MA")
bandsStyle = input.string("Average True Range", "Bands Style", options = ["Average True Range", "True Range", "Range"])
atrlength = input.int(10, "ATR Length", minval = 1)
ma = useExp ? ta.ema(src, length) : ta.sma(src, length)
rangema = bandsStyle == "True Range" ? ta.tr(true) : bandsStyle == "Average True Range" ? ta.atr(atrlength) : ta.rma(high - low, length)
plot(ma, "Basis")
plot(ma + rangema * mult, "Upper")
plot(ma - rangema * mult, "Lower")`,
});
