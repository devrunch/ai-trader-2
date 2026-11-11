import { numberInput } from '../inputs';
import { defineBuiltin, lengthInput, line, recursiveWarmup } from './define';

const AD_BAR = 'ad = close == high and close == low or high == low ? 0 : ((2 * close - low - high) / (high - low)) * volume';

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
${AD_BAR}
plot(ta.sma(ad, length) / ta.sma(volume, length), "Chaikin Money Flow")`,
});

const int = (id: string, title: string, fallback: number) => ({ id, title, type: 'int' as const, default: fallback, min: 1, max: 5000 });
const zero = [{ id: 'zero', title: 'Zero', value: 0 }];

export const CHAIKIN_OSCILLATOR = defineBuiltin({
  id: 'chaikinosc', name: 'Chaikin Oscillator', shortName: 'Chaikin Osc', overlay: false, inputs: [int('fast', 'Fast Length', 3), int('slow', 'Slow Length', 10)],
  plots: [line('osc', 'Chaikin Oscillator', 'blue')], levels: zero,
  warmup: values => recursiveWarmup(Math.max(numberInput(values, 'fast'), numberInput(values, 'slow'))),
  pine: `//@version=6
indicator("Chaikin Oscillator", "Chaikin Osc")
fast = input.int(3, "Fast Length", minval = 1)
slow = input.int(10, "Slow Length", minval = 1)
${AD_BAR}
accdist = ta.cum(ad)
plot(ta.ema(accdist, fast) - ta.ema(accdist, slow), "Chaikin Oscillator")`,
});

export const ACCUMULATION_DISTRIBUTION = defineBuiltin({
  id: 'ad', name: 'Accumulation/Distribution', shortName: 'A/D', overlay: false, inputs: [],
  plots: [line('ad', 'Accumulation/Distribution', 'blue')], warmup: () => 0,
  pine: `//@version=6
indicator("Accumulation/Distribution", "A/D")
${AD_BAR}
plot(ta.cum(ad), "Accumulation/Distribution")`,
});

export const PVT = defineBuiltin({
  id: 'pvt', name: 'Price Volume Trend', shortName: 'PVT', overlay: false, inputs: [],
  plots: [line('pvt', 'PVT', 'blue')], warmup: () => 0,
  pine: `//@version=6
indicator("Price Volume Trend", "PVT")
plot(ta.cum((close - close[1]) / close[1] * volume), "PVT")`,
});

export const EASE_OF_MOVEMENT = defineBuiltin({
  id: 'eom', name: 'Ease of Movement', shortName: 'EOM', overlay: false, inputs: [lengthInput(14), int('divisor', 'Divisor', 10000)],
  plots: [line('eom', 'EOM', 'green')], levels: zero, warmup: values => numberInput(values, 'length') + 1,
  pine: `//@version=6
indicator("Ease of Movement", "EOM")
length = input.int(14, "Length", minval = 1)
div = input.int(10000, "Divisor", minval = 1)
plot(ta.sma(div * (hl2 - hl2[1]) * (high - low) / volume, length), "EOM")`,
});

export const ELDER_FORCE_INDEX = defineBuiltin({
  id: 'efi', name: "Elder's Force Index", shortName: 'EFI', overlay: false, inputs: [lengthInput(13)],
  plots: [line('efi', "Elder's Force Index", 'red')], levels: zero, warmup: values => recursiveWarmup(numberInput(values, 'length')),
  pine: `//@version=6
indicator("Elder's Force Index", "EFI")
length = input.int(13, "Length", minval = 1)
plot(ta.ema((close - close[1]) * volume, length), "Elder's Force Index")`,
});
