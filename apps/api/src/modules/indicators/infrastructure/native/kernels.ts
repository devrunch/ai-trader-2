import { RSI, SMA, TR, VWMA, WMA, WSMA, getStandardDeviation } from 'trading-signals';

/** A streaming series: `replace` recomputes the last input from saved state. `null` where Pine has `na`. */
export interface SeriesKernel { update(value: number, replace: boolean): number | null }
export interface VolumeKernel { update(value: number, volume: number, replace: boolean): number | null }
interface Updatable { update(value: number, replace: boolean): number | null }

const wrap = (indicator: Updatable): SeriesKernel => ({ update: (value, replace) => indicator.update(value, replace) });
export const smaKernel = (length: number): SeriesKernel => wrap(new SMA(length));
export const wmaKernel = (length: number): SeriesKernel => wrap(new WMA(length));
/** Pine's `ta.rma`: SMA-seeded, alpha 1/length (trading-signals' WSMA). */
export const rmaKernel = (length: number): SeriesKernel => wrap(new WSMA(length));
export const rsiKernel = (length: number): SeriesKernel => wrap(new RSI(length));

/** Pine's `ta.ema`: `na` for length − 1 bars, seeded with their SMA (trading-signals seeds with the first price). */
export function emaKernel(length: number): SeriesKernel {
  const seed = new SMA(length);
  const alpha = 2 / (length + 1);
  let previous: number | null = null;
  let current: number | null = null;
  return {
    update(value, replace) {
      if (!replace) previous = current;
      current = previous === null ? seed.update(value, replace) : alpha * value + (1 - alpha) * previous;
      return current;
    },
  };
}

/** Pine's `ta.vwma`: sma(src × volume) / sma(volume). */
export function vwmaKernel(length: number): VolumeKernel {
  const vwma = new VWMA(length);
  return { update: (value, volume, replace) => vwma.update({ high: value, low: value, close: value, volume }, replace) };
}

/** Pine's `ta.stdev` (population, biased). */
export function stdevKernel(length: number): SeriesKernel {
  const window = new RollingWindow(length);
  return { update(value, replace) {
    const values = window.update(value, replace);
    if (!values) return null;
    const mean = values.reduce((sum, x) => sum + x, 0) / length;
    return getStandardDeviation(values.slice(), mean);
  } };
}

/** Pine's `ta.tr(true)`: high − low on the first bar. */
export function trueRangeKernel(): { update(bar: { high: number; low: number; close: number }, replace: boolean): number } {
  const tr = new TR();
  return { update: (bar, replace) => tr.update(bar, replace) };
}

/** The last `length` inputs, oldest first; `null` until full. */
export class RollingWindow {
  private readonly values: number[] = [];
  constructor(private readonly length: number) {}
  update(value: number, replace: boolean): readonly number[] | null {
    if (replace && this.values.length) this.values[this.values.length - 1] = value;
    else { this.values.push(value); if (this.values.length > this.length) this.values.shift(); }
    return this.values.length === this.length ? this.values : null;
  }
}

/**
 * Feeds a kernel only while its input is defined, as Pine skips leading `na`; `replace` on a bar that was never fed adds it.
 * Inputs here are `na` only during warm-up, which depends on bar count alone, so a bar never turns from fed to unfed.
 */
export function gated(kernel: SeriesKernel): { update(value: number | null, replace: boolean): number | null } {
  let lastFed = false;
  return { update(value, replace) {
    if (value === null) { lastFed = false; return null; }
    const result = kernel.update(value, replace && lastFed);
    lastFed = true;
    return result;
  } };
}

/** The value `bars` back; `null` before that, and where that value was `null`. */
export function delayKernel(bars: number): { update(value: number | null, replace: boolean): number | null } {
  const buffer: (number | null)[] = [];
  return { update(value, replace) {
    if (replace && buffer.length) buffer[buffer.length - 1] = value;
    else { buffer.push(value); if (buffer.length > bars + 1) buffer.shift(); }
    return buffer.length === bars + 1 ? buffer[0] ?? null : null;
  } };
}

/** Pine's `ta.change`: the value less the previous one; `null` on the first. */
export function changeKernel(): SeriesKernel {
  const previous = delayKernel(1);
  return { update(value, replace) {
    const before = previous.update(value, replace);
    return before === null ? null : value - before;
  } };
}

/** Pine's `ta.roc`: percent change over `length` bars; `null` when the earlier value is 0. */
export function rocKernel(length: number): SeriesKernel {
  const previous = delayKernel(length);
  return { update(value, replace) {
    const before = previous.update(value, replace);
    return before === null || before === 0 ? null : 100 * (value - before) / before;
  } };
}

/** `reduce` over the last `length` inputs; `null` until full, and when any is `null` (Pine's `na` poisons a window). */
export function windowKernel(length: number, reduce: (values: readonly number[]) => number): { update(value: number | null, replace: boolean): number | null } {
  const window = new RollingWindow(length);
  return { update(value, replace) {
    const values = window.update(value ?? Number.NaN, replace);
    const result = values ? reduce(values) : Number.NaN;
    return Number.isFinite(result) ? result : null;
  } };
}

export const sumOf = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
