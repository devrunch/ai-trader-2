import { barsInDays, defineBuiltin, line } from './define';

const LEVELS = ['R5', 'R4', 'R3', 'R2', 'R1', 'P', 'S1', 'S2', 'S3', 'S4', 'S5'] as const;
const color = (name: string) => (name === 'P' ? 'gray' : name.startsWith('R') ? 'red' : 'green');

export const PIVOTS = defineBuiltin({
  id: 'pivots', name: 'Pivot Points Standard', shortName: 'Pivots', overlay: true,
  inputs: [{ id: 'type', title: 'Type', type: 'string', default: 'Traditional', options: ['Traditional'] }],
  plots: LEVELS.map(name => ({ ...line(name.toLowerCase(), name, color(name)), kind: 'step' as const })),
  // The previous day's high, low and close: this day and the one before.
  warmup: (_, interval) => barsInDays(2, interval),
  pine: `//@version=6
indicator("Pivot Points Standard", "Pivots", overlay = true)
pivotType = input.string("Traditional", "Type", options = ["Traditional"])
var float dayHigh = na
var float dayLow = na
var float prevHigh = na
var float prevLow = na
var float prevClose = na
if timeframe.change("D") or na(close[1])
    prevHigh := dayHigh
    prevLow := dayLow
    prevClose := close[1]
    dayHigh := high
    dayLow := low
else
    dayHigh := math.max(dayHigh, high)
    dayLow := math.min(dayLow, low)
pp = (prevHigh + prevLow + prevClose) / 3
plot(pp * 4 + (prevHigh - 4 * prevLow), "R5")
plot(pp * 3 + (prevHigh - 3 * prevLow), "R4")
plot(pp * 2 + (prevHigh - 2 * prevLow), "R3")
plot(pp + (prevHigh - prevLow), "R2")
plot(pp * 2 - prevLow, "R1")
plot(pp, "P")
plot(pp * 2 - prevHigh, "S1")
plot(pp - (prevHigh - prevLow), "S2")
plot(pp * 2 - (2 * prevHigh - prevLow), "S3")
plot(pp * 3 - (3 * prevHigh - prevLow), "S4")
plot(pp * 4 - (4 * prevHigh - prevLow), "S5")`,
});
