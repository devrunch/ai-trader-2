import { numberInput, sourceInput, type ResolvedInputs } from '../../domain/inputs';
import { priceOf } from '../../domain/source';
import type { BarKernel, BarKernelFactory } from './bar-kernel';
import { RollingExtremes, previousBar } from './extremes-kernel';
import { RollingWindow, rocKernel, sumOf } from './kernels';

/** Pine's `ta.cci`: (src − sma) / (0.015 × mean absolute deviation); `na` on a flat window. */
function cci(inputs: ResolvedInputs): BarKernel {
  const length = numberInput(inputs, 'length');
  const window = new RollingWindow(length);
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const price = priceOf(bar, source);
    const values = window.update(price, replace);
    if (!values) return { cci: null };
    const mean = sumOf(values) / length;
    const deviation = sumOf(values.map(value => Math.abs(value - mean))) / length;
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
    const lower = sumOf(down);
    return { mf: lower === 0 ? 100 : 100 - 100 / (1 + sumOf(up) / lower) };
  } };
}

function williamsR(inputs: ResolvedInputs): BarKernel {
  const extremes = new RollingExtremes(numberInput(inputs, 'length'));
  return { update(bar, replace) {
    const range = extremes.update(bar, replace);
    return { pr: range && range.high !== range.low ? 100 * (bar.close - range.high) / (range.high - range.low) : null };
  } };
}

/** Momentum: the source less the source `length` bars back. */
const momentum: BarKernelFactory = inputs => {
  const window = new RollingWindow(numberInput(inputs, 'length') + 1);
  const source = sourceInput(inputs, 'source');
  return { update(bar, replace) {
    const now = priceOf(bar, source);
    const then = window.update(now, replace)?.[0];
    return { mom: then === undefined ? null : now - then };
  } };
};

const roc: BarKernelFactory = inputs => {
  const kernel = rocKernel(numberInput(inputs, 'length'));
  const source = sourceInput(inputs, 'source');
  return { update: (bar, replace) => ({ roc: kernel.update(priceOf(bar, source), replace) }) };
};

export const MOMENTUM_KERNELS: Record<string, BarKernelFactory> = {
  cci, mfi, wpr: williamsR,
  roc, mom: momentum,
};
