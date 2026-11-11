import { numberInput } from '../inputs';
import { defineBuiltin, line, recursiveWarmup } from './define';

const dmiInputs = [
  { id: 'adxSmoothing', title: 'ADX Smoothing', type: 'int' as const, default: 14, min: 1, max: 50 },
  { id: 'diLength', title: 'DI Length', type: 'int' as const, default: 14, min: 1, max: 5000 },
];
const dmiWarmup = (values: Parameters<typeof numberInput>[0]): number => recursiveWarmup(numberInput(values, 'adxSmoothing') + numberInput(values, 'diLength'));
const dmiPine = (title: string, short: string, plots: string): string => `//@version=6
indicator("${title}", "${short}")
adxlen = input.int(14, "ADX Smoothing", minval = 1, maxval = 50)
dilen = input.int(14, "DI Length", minval = 1)
[diplus, diminus, adx] = ta.dmi(dilen, adxlen)
${plots}`;

export const DMI = defineBuiltin({
  id: 'dmi', name: 'Directional Movement Index', shortName: 'DMI', overlay: false, inputs: dmiInputs,
  plots: [line('adx', 'ADX', 'red'), line('plusDi', '+DI', 'blue'), line('minusDi', '-DI', 'orange')], warmup: dmiWarmup,
  pine: dmiPine('Directional Movement Index', 'DMI', `plot(adx, "ADX")
plot(diplus, "+DI")
plot(diminus, "-DI")`),
});

export const ADX = defineBuiltin({
  id: 'adx', name: 'Average Directional Index', shortName: 'ADX', overlay: false, inputs: dmiInputs,
  plots: [line('adx', 'ADX', 'red')], warmup: dmiWarmup,
  pine: dmiPine('Average Directional Index', 'ADX', 'plot(adx, "ADX")'),
});

export const PSAR = defineBuiltin({
  id: 'psar', name: 'Parabolic SAR', shortName: 'PSAR', overlay: true,
  inputs: [
    { id: 'start', title: 'Start', type: 'float', default: 0.02, min: 0.001, max: 1, step: 0.01 },
    { id: 'increment', title: 'Increment', type: 'float', default: 0.02, min: 0.001, max: 1, step: 0.01 },
    { id: 'maximum', title: 'Maximum', type: 'float', default: 0.2, min: 0.001, max: 1, step: 0.01 },
  ],
  plots: [{ id: 'psar', title: 'ParabolicSAR', kind: 'circles', color: 'blue', lineWidth: 1 }],
  // The trend flips on price alone, so state converges once a few trends have run.
  warmup: () => 500,
  pine: `//@version=6
indicator("Parabolic SAR", "PSAR", overlay = true)
start = input.float(0.02, "Start", minval = 0.001, maxval = 1, step = 0.01)
increment = input.float(0.02, "Increment", minval = 0.001, maxval = 1, step = 0.01)
maximum = input.float(0.2, "Maximum", minval = 0.001, maxval = 1, step = 0.01)
plot(ta.sar(start, increment, maximum), "ParabolicSAR", style = plot.style_circles)`,
});

export const ICHIMOKU = defineBuiltin({
  id: 'ichimoku', name: 'Ichimoku Cloud', shortName: 'Ichimoku Cloud', overlay: true,
  inputs: [
    { id: 'conversionPeriods', title: 'Conversion Line Length', type: 'int', default: 9, min: 1, max: 5000 },
    { id: 'basePeriods', title: 'Base Line Length', type: 'int', default: 26, min: 1, max: 5000 },
    { id: 'laggingSpan2Periods', title: 'Leading Span B Length', type: 'int', default: 52, min: 1, max: 5000 },
    { id: 'displacement', title: 'Lagging Span', type: 'int', default: 26, min: 1, max: 500 },
  ],
  plots: [line('conversion', 'Conversion Line', 'blue'), line('base', 'Base Line', 'red'), line('lagging', 'Lagging Span', 'green'),
    line('leadA', 'Leading Span A', 'green'), line('leadB', 'Leading Span B', 'red')],
  warmup: values => Math.max(numberInput(values, 'basePeriods'), numberInput(values, 'laggingSpan2Periods'), numberInput(values, 'conversionPeriods')),
  // TradingView draws the spans at `displacement - 1` bars from the bar they are computed on.
  plotOffsets: values => {
    const shift = numberInput(values, 'displacement') - 1;
    return { lagging: 0 - shift, leadA: shift, leadB: shift };
  },
  pine: `//@version=6
indicator("Ichimoku Cloud", "Ichimoku Cloud", overlay = true)
conversionPeriods = input.int(9, "Conversion Line Length", minval = 1)
basePeriods = input.int(26, "Base Line Length", minval = 1)
laggingSpan2Periods = input.int(52, "Leading Span B Length", minval = 1)
displacement = input.int(26, "Lagging Span", minval = 1)
donchian(len) => math.avg(ta.lowest(len), ta.highest(len))
conversionLine = donchian(conversionPeriods)
baseLine = donchian(basePeriods)
leadLine1 = math.avg(conversionLine, baseLine)
leadLine2 = donchian(laggingSpan2Periods)
plot(conversionLine, "Conversion Line")
plot(baseLine, "Base Line")
plot(close, "Lagging Span", offset = -displacement + 1)
plot(leadLine1, "Leading Span A", offset = displacement - 1)
plot(leadLine2, "Leading Span B", offset = displacement - 1)`,
});

export const AROON = defineBuiltin({
  id: 'aroon', name: 'Aroon', shortName: 'Aroon', overlay: false,
  inputs: [{ id: 'length', title: 'Length', type: 'int', default: 14, min: 1, max: 5000 }],
  plots: [line('down', 'Aroon Down', 'orange'), line('up', 'Aroon Up', 'blue')],
  warmup: values => numberInput(values, 'length') + 1,
  pine: `//@version=6
indicator("Aroon", "Aroon")
length = input.int(14, "Length", minval = 1)
upper = 100 * (ta.highestbars(high, length + 1) + length) / length
lower = 100 * (ta.lowestbars(low, length + 1) + length) / length
plot(lower, "Aroon Down")
plot(upper, "Aroon Up")`,
});
