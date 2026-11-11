import { numberInput } from '../inputs';
import { defineBuiltin, lengthInput, line } from './define';

export const OBV = defineBuiltin({
  id: 'obv', name: 'On Balance Volume', shortName: 'OBV', overlay: false, inputs: [],
  plots: [line('obv', 'OnBalanceVolume', 'blue')],
  // A running total: it starts at the first bar read, so TradingView's value differs by a constant unless read from the first bar.
  warmup: () => 0,
  pine: `//@version=6
indicator("On Balance Volume", "OBV")
plot(ta.cum(math.sign(ta.change(close)) * volume), "OnBalanceVolume")`,
});

export const CMF = defineBuiltin({
  id: 'cmf', name: 'Chaikin Money Flow', shortName: 'CMF', overlay: false, inputs: [lengthInput(20)],
  plots: [line('cmf', 'Chaikin Money Flow', 'green')], levels: [{ id: 'zero', title: 'Zero', value: 0 }],
  warmup: values => numberInput(values, 'length'),
  pine: `//@version=6
indicator("Chaikin Money Flow", "CMF")
length = input.int(20, "Length", minval = 1)
ad = close == high and close == low or high == low ? 0 : ((2 * close - low - high) / (high - low)) * volume
plot(ta.sma(ad, length) / ta.sma(volume, length), "Chaikin Money Flow")`,
});
