import type { Bar } from '@aitrader/contracts';
import { numberInput, sourceInput, stringInput, type ResolvedInputs } from '../../domain/inputs';
import { priceOf } from '../../domain/source';
import type { BarKernel, BarKernelFactory } from './bar-kernel';
import { stdevKernel, trueRangeKernel } from './kernels';
import { maKernel } from './moving-average-kernels';

function bb(inputs: ResolvedInputs): BarKernel {
  const length = numberInput(inputs, 'length');
  const basis = maKernel(stringInput(inputs, 'maType'), length);
  const deviation = stdevKernel(length);
  const mult = numberInput(inputs, 'mult');
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const price = priceOf(bar, source);
    const mid = basis.update(price, bar, replace);
    const dev = deviation.update(price, replace);
    if (mid === null || dev === null) return { basis: mid, upper: null, lower: null };
    return { basis: mid, upper: mid + mult * dev, lower: mid - mult * dev };
  } };
}

/** Pine's `ta.atr` with TradingView's smoothing choice: the moving average of `ta.tr(true)`. */
function atrSeries(smoothing: string, length: number): { update(bar: Bar, replace: boolean): number | null } {
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

export const VOLATILITY_KERNELS: Record<string, BarKernelFactory> = { bb, atr, supertrend };
