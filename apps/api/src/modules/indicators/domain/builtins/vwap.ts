import type { Interval } from '@aitrader/contracts';
import { stringInput } from '../inputs';
import { defineBuiltin, line, offsetInput, sourceInputDef } from './define';

export const VWAP_ANCHORS = ['Session', 'Week', 'Month', 'Quarter', 'Year'];
const anchorDays: Record<string, number> = { Session: 1, Week: 7, Month: 31, Quarter: 92, Year: 366 };
const intervalDays: Record<Interval, number> = { '1': 1 / 1440, '3': 3 / 1440, '5': 5 / 1440, '15': 15 / 1440, '30': 30 / 1440,
  '60': 1 / 24, '240': 1 / 6, '1D': 1, '1W': 7, '1M': 31 };

const band = (n: number, show: boolean) => [
  { id: `showBand${String(n)}`, title: `Show Band #${String(n)}`, type: 'bool' as const, default: show },
  { id: `bandMult${String(n)}`, title: `Bands Multiplier #${String(n)}`, type: 'float' as const, default: n, min: 0, max: 100, step: 0.5 },
];
const bandPine = (n: number) => `plot(showBand${String(n)} ? vwap + bandBasis * bandMult${String(n)} : na, "Upper Band #${String(n)}", offset = offset)
plot(showBand${String(n)} ? vwap - bandBasis * bandMult${String(n)} : na, "Lower Band #${String(n)}", offset = offset)`;

export const VWAP = defineBuiltin({
  id: 'vwap', name: 'Volume Weighted Average Price', shortName: 'VWAP', overlay: true,
  inputs: [
    { id: 'anchor', title: 'Anchor Period', type: 'string', default: 'Session', options: VWAP_ANCHORS }, sourceInputDef('hlc3'), offsetInput,
    { id: 'bandsMode', title: 'Bands Calculation Mode', type: 'string', default: 'Standard Deviation', options: ['Standard Deviation', 'Percentage'] },
    ...band(1, true), ...band(2, false), ...band(3, false),
  ],
  plots: [line('vwap', 'VWAP', 'blue'),
    ...[1, 2, 3].flatMap(n => [line(`upper${String(n)}`, `Upper Band #${String(n)}`, 'green'), line(`lower${String(n)}`, `Lower Band #${String(n)}`, 'green')])],
  // Enough bars to start at an anchor boundary; capped by the read limit.
  warmup: (values, interval) => Math.ceil((anchorDays[stringInput(values, 'anchor')] ?? 1) / intervalDays[interval]),
  pine: `//@version=6
indicator("Volume Weighted Average Price", "VWAP", overlay = true)
anchor = input.string("Session", "Anchor Period", options = ["Session", "Week", "Month", "Quarter", "Year"])
src = input.source(hlc3, "Source")
offset = input.int(0, "Offset", minval = -500, maxval = 500)
bandsMode = input.string("Standard Deviation", "Bands Calculation Mode", options = ["Standard Deviation", "Percentage"])
showBand1 = input.bool(true, "Show Band #1")
bandMult1 = input.float(1.0, "Bands Multiplier #1", minval = 0, step = 0.5)
showBand2 = input.bool(false, "Show Band #2")
bandMult2 = input.float(2.0, "Bands Multiplier #2", minval = 0, step = 0.5)
showBand3 = input.bool(false, "Show Band #3")
bandMult3 = input.float(3.0, "Bands Multiplier #3", minval = 0, step = 0.5)
isNewPeriod = anchor == "Session" ? timeframe.change("D") : anchor == "Week" ? timeframe.change("W") : anchor == "Month" ? timeframe.change("M") : anchor == "Quarter" ? timeframe.change("3M") : timeframe.change("12M")
if na(src[1])
    isNewPeriod := true
[vwap, stdevUpper, _] = ta.vwap(src, isNewPeriod, 1)
bandBasis = bandsMode == "Standard Deviation" ? stdevUpper - vwap : vwap * 0.01
plot(vwap, "VWAP", offset = offset)
${[1, 2, 3].map(bandPine).join('\n')}`,
});
