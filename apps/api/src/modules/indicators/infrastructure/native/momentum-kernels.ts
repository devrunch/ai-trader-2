import { numberInput, sourceInput, type ResolvedInputs } from '../../domain/inputs';
import { priceOf } from '../../domain/source';
import type { BarKernel, BarKernelFactory } from './bar-kernel';
import { RollingExtremes, previousBar } from './extremes-kernel';
import { RollingWindow } from './kernels';

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

/** Pine's `ta.cci`: (src − sma) / (0.015 × mean absolute deviation); `na` on a flat window. */
function cci(inputs: ResolvedInputs): BarKernel {
  const length = numberInput(inputs, 'length');
  const window = new RollingWindow(length);
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const price = priceOf(bar, source);
    const values = window.update(price, replace);
    if (!values) return { cci: null };
    const mean = sum(values) / length;
    const deviation = sum(values.map(value => Math.abs(value - mean))) / length;
    return { cci: deviation === 0 ? null : (price - mean) / (0.015 * deviation) };
  } };
}

/** `ta.mfi(hlc3, length)`: 100 − 100 / (1 + positive flow / negative flow) over the window; the first bar counts as both. */
function mfi(inputs: ResolvedInputs): BarKernel {
  const length = numberInput(inputs, 'length');
  const positive = new RollingWindow(length);
  const negative = new RollingWindow(length);
  const previous = previousBar();
  return { update(bar, replace) {
    const price = (bar.high + bar.low + bar.close) / 3;
    const before = previous.advance(bar, replace);
    const change = before ? price - (before.high + before.low + before.close) / 3 : null;
    const flow = price * (bar.volume ?? 0);
    const up = positive.update(change !== null && change <= 0 ? 0 : flow, replace);
    const down = negative.update(change !== null && change >= 0 ? 0 : flow, replace);
    if (!up || !down) return { mf: null };
    const lower = sum(down);
    return { mf: lower === 0 ? 100 : 100 - 100 / (1 + sum(up) / lower) };
  } };
}

function williamsR(inputs: ResolvedInputs): BarKernel {
  const extremes = new RollingExtremes(numberInput(inputs, 'length'));
  return { update(bar, replace) {
    const range = extremes.update(bar, replace);
    return { pr: range && range.high !== range.low ? 100 * (bar.close - range.high) / (range.high - range.low) : null };
  } };
}

/** The source `length` bars back, against the source now. */
const lagged = (id: string, combine: (now: number, then: number) => number | null): BarKernelFactory => inputs => {
  const window = new RollingWindow(numberInput(inputs, 'length') + 1);
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const now = priceOf(bar, source);
    const values = window.update(now, replace);
    const then = values?.[0];
    return { [id]: then === undefined ? null : combine(now, then) };
  } };
};

export const MOMENTUM_KERNELS: Record<string, BarKernelFactory> = {
  cci, mfi, wpr: williamsR,
  roc: lagged('roc', (now, then) => (then === 0 ? null : 100 * (now - then) / then)),
  mom: lagged('mom', (now, then) => now - then),
};
