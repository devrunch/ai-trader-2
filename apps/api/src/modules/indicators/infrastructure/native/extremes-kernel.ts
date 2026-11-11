import type { Bar } from '@aitrader/contracts';
import { RollingWindow } from './kernels';

/** Highest high and lowest low of the last `length` bars (Pine's `ta.highest(length)` / `ta.lowest(length)`); `null` until full. */
export class RollingExtremes {
  private readonly highs: RollingWindow;
  private readonly lows: RollingWindow;
  constructor(length: number) { this.highs = new RollingWindow(length); this.lows = new RollingWindow(length); }
  update(bar: Bar, replace: boolean): { high: number; low: number } | null {
    const highs = this.highs.update(bar.high, replace);
    const lows = this.lows.update(bar.low, replace);
    return highs && lows ? { high: Math.max(...highs), low: Math.min(...lows) } : null;
  }
}

/** Pine's `fixnan`: the last defined value in place of `na`. */
export function fixnan(): { update(value: number | null, replace: boolean): number | null } {
  let previous: number | null = null;
  let current: number | null = null;
  return { update(value, replace) {
    if (!replace) previous = current;
    current = value ?? previous;
    return current;
  } };
}

/** Folds bars into a state; `replace` re-runs the last bar from the state before it. */
export function stepper<S>(initial: S, step: (previous: S, bar: Bar) => S): { update(bar: Bar, replace: boolean): S } {
  let previous = initial;
  let current = initial;
  return { update(bar, replace) {
    if (!replace) previous = current;
    current = step(previous, bar);
    return current;
  } };
}

/** The bar before the one being fed; `replace` keeps it. */
export function previousBar(): { advance(bar: Bar, replace: boolean): Bar | undefined } {
  let committed: Bar | undefined;
  let latest: Bar | undefined;
  return { advance(bar, replace) {
    if (!replace) committed = latest;
    latest = bar;
    return committed;
  } };
}
