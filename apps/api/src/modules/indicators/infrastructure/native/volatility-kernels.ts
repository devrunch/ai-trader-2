import type { Bar, Interval } from '@aitrader/contracts';
import { numberInput, sourceInput, stringInput, type ResolvedInputs } from '../../domain/inputs';
import { priceOf } from '../../domain/source';
import type { BarKernel, BarKernelFactory } from './bar-kernel';
import { delayKernel, gated, stdevKernel, trueRangeKernel, windowKernel } from './kernels';
import { maKernel } from './moving-average-kernels';

/** The basis ± `mult` population standard deviations (Pine's `ta.stdev`). */
function bollinger(maType: string, length: number, mult: number): { update(price: number, bar: Bar, replace: boolean): { basis: number | null; upper: number | null; lower: number | null } } {
  const basis = maKernel(maType, length);
  const deviation = stdevKernel(length);
  return { update(price, bar, replace) {
    const mid = basis.update(price, bar, replace);
    const dev = deviation.update(price, replace);
    if (mid === null || dev === null) return { basis: mid, upper: null, lower: null };
    return { basis: mid, upper: mid + mult * dev, lower: mid - mult * dev };
  } };
}

function bb(inputs: ResolvedInputs): BarKernel {
  const bands = bollinger(stringInput(inputs, 'maType'), numberInput(inputs, 'length'), numberInput(inputs, 'mult'));
  const source = sourceInput(inputs, 'source');
  return { update: (bar, replace) => bands.update(priceOf(bar, source), bar, replace) };
}

function percentB(inputs: ResolvedInputs): BarKernel {
  const bands = bollinger('SMA', numberInput(inputs, 'length'), numberInput(inputs, 'mult'));
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const price = priceOf(bar, source);
    const { upper, lower } = bands.update(price, bar, replace);
    return { percentB: upper === null || lower === null || upper === lower ? null : (price - lower) / (upper - lower) };
  } };
}

/** Bollinger BandWidth with its highest and lowest value over the expansion and contraction windows. */
function bandWidth(inputs: ResolvedInputs): BarKernel {
  const bands = bollinger('SMA', numberInput(inputs, 'length'), numberInput(inputs, 'mult'));
  const highest = windowKernel(numberInput(inputs, 'expansion'), values => Math.max(...values));
  const lowest = windowKernel(numberInput(inputs, 'contraction'), values => Math.min(...values));
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const { basis, upper, lower } = bands.update(priceOf(bar, source), bar, replace);
    const width = basis === null || upper === null || lower === null || basis === 0 ? null : (upper - lower) / basis;
    return { bbw: width, highest: highest.update(width, replace), lowest: lowest.update(width, replace) };
  } };
}

const DAILY_OR_FINER = new Set<Interval>(['1', '3', '5', '15', '30', '60', '240', '1D']);

/** TradingView's Historical Volatility: stdev of log returns, annualised over 365 days (7 for weekly and monthly bars). */
const historicalVolatility: BarKernelFactory = (inputs, context) => {
  const close = delayKernel(1);
  const deviation = gated(stdevKernel(numberInput(inputs, 'length')));
  const scale = Math.sqrt(365 / (DAILY_OR_FINER.has(context.interval) ? 1 : 7));
  return { update(bar, replace) {
    const before = close.update(bar.close, replace);
    const sd = deviation.update(before === null ? null : Math.log(bar.close / before), replace);
    return { hv: sd === null ? null : 100 * sd * scale };
  } };
};

/** Pine's `ta.atr` with TradingView's smoothing choice: the moving average of `ta.tr(true)`. */
export function atrSeries(smoothing: string, length: number): { update(bar: Bar, replace: boolean): number | null } {
  const tr = trueRangeKernel();
  const ma = maKernel(smoothing, length);
  return { update: (bar, replace) => ma.update(tr.update(bar, replace), bar, replace) };
}

function atr(inputs: ResolvedInputs): BarKernel {
  const series = atrSeries(stringInput(inputs, 'smoothing'), numberInput(inputs, 'length'));
  return { update: (bar, replace) => ({ atr: series.update(bar, replace) }) };
}

interface TrendState { close: number; atr: number | null; upper: number | null; lower: number | null; trend: number | null }

/** Pine's `ta.supertrend(factor, atrPeriod)`, line by line; direction −1 is an uptrend. */
function supertrend(inputs: ResolvedInputs): BarKernel {
  const factor = numberInput(inputs, 'factor');
  const atrValue = atrSeries('RMA', numberInput(inputs, 'atrPeriod'));
  let previous: TrendState | undefined;
  let current: TrendState | undefined;
  return { update(bar, replace) {
    if (!replace) previous = current;
    const value = atrValue.update(bar, replace);
    if (value === null) { current = { close: bar.close, atr: null, upper: null, lower: null, trend: null }; return { up: null, down: null }; }
    const src = (bar.high + bar.low) / 2;
    const prevLower = previous?.lower ?? 0;
    const prevUpper = previous?.upper ?? 0;
    const prevClose = previous?.close;
    let lower = src - factor * value;
    let upper = src + factor * value;
    lower = lower > prevLower || (prevClose !== undefined && prevClose < prevLower) ? lower : prevLower;
    upper = upper < prevUpper || (prevClose !== undefined && prevClose > prevUpper) ? upper : prevUpper;
    let direction: number;
    if (previous?.atr === null || previous === undefined) direction = 1;
    else if (previous.trend === prevUpper) direction = bar.close > upper ? -1 : 1;
    else direction = bar.close < lower ? 1 : -1;
    const trend = direction === -1 ? lower : upper;
    current = { close: bar.close, atr: value, upper, lower, trend };
    return direction < 0 ? { up: trend, down: null } : { up: null, down: trend };
  } };
}

export const VOLATILITY_KERNELS: Record<string, BarKernelFactory> = { bb, atr, supertrend, hv: historicalVolatility, bbpercentb: percentB, bbw: bandWidth };
