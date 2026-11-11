import type { Bar } from '@aitrader/contracts';
import { numberInput, type ResolvedInputs } from '../../domain/inputs';
import type { BarKernel, BarKernelFactory } from './bar-kernel';
import { RollingExtremes, fixnan, previousBar, stepper } from './extremes-kernel';
import { RollingWindow, gated, rmaKernel } from './kernels';

/** Pine's `ta.dmi(diLength, adxSmoothing)`: directional movement over `ta.tr` (`na` on the first bar) through RMAs. */
function dmi(inputs: ResolvedInputs): BarKernel {
  const diLength = numberInput(inputs, 'diLength');
  const plusRma = gated(rmaKernel(diLength));
  const minusRma = gated(rmaKernel(diLength));
  const rangeRma = gated(rmaKernel(diLength));
  const adxRma = gated(rmaKernel(numberInput(inputs, 'adxSmoothing')));
  const plusFixed = fixnan();
  const minusFixed = fixnan();
  const previous = previousBar();
  return { update(bar, replace) {
    const before = previous.advance(bar, replace);
    const up = before ? bar.high - before.high : null;
    const down = before ? before.low - bar.low : null;
    const range = before ? Math.max(bar.high - bar.low, Math.abs(bar.high - before.close), Math.abs(bar.low - before.close)) : null;
    const trur = rangeRma.update(range, replace);
    const directional = (movement: number | null, other: number | null, rma: typeof plusRma, fixed: typeof plusFixed): number | null => {
      const dm = movement === null || other === null ? null : movement > other && movement > 0 ? movement : 0;
      const smoothed = rma.update(dm, replace);
      return fixed.update(smoothed === null || trur === null || trur === 0 ? null : 100 * smoothed / trur, replace);
    };
    const plus = directional(up, down, plusRma, plusFixed);
    const minus = directional(down, up, minusRma, minusFixed);
    const total = plus === null || minus === null ? null : plus + minus;
    const adx = adxRma.update(total === null || plus === null || minus === null ? null : Math.abs(plus - minus) / (total === 0 ? 1 : total), replace);
    return { adx: adx === null ? null : 100 * adx, plusDi: plus, minusDi: minus };
  } };
}

const onlyAdx: BarKernelFactory = inputs => {
  const kernel = dmi(inputs);
  return { update: (bar, replace) => ({ adx: kernel.update(bar, replace).adx ?? null }) };
};

interface SarState {
  index: number; result: number | null; maxMin: number; acceleration: number; below: boolean;
  /** The two bars before this one. */
  bars: readonly Bar[];
}

/** Pine's `ta.sar(start, inc, max)`: the reference implementation from the Pine reference manual. */
function psar(inputs: ResolvedInputs): BarKernel {
  const start = numberInput(inputs, 'start');
  const increment = numberInput(inputs, 'increment');
  const maximum = numberInput(inputs, 'maximum');
  const initial: SarState = { index: -1, result: null, maxMin: 0, acceleration: start, below: false, bars: [] };
  const sar = stepper(initial, (state, bar) => {
    const index = state.index + 1;
    const [one, two] = [state.bars[0], state.bars[1]];
    const bars = [bar, ...state.bars].slice(0, 2);
    if (one === undefined) return { ...initial, index, bars };
    if (index === 1) {
      const below = bar.close > one.close;
      return { index, result: below ? one.low : one.high, maxMin: below ? bar.high : bar.low, acceleration: start, below, bars };
    }
    if (state.result === null || two === undefined) return { ...initial, index, bars };
    let { below, maxMin, acceleration } = state;
    let result = state.result + acceleration * (maxMin - state.result);
    let firstTrendBar = false;
    if (below && result > bar.low) {
      firstTrendBar = true; below = false; result = Math.max(bar.high, maxMin); maxMin = bar.low; acceleration = start;
    } else if (!below && result < bar.high) {
      firstTrendBar = true; below = true; result = Math.min(bar.low, maxMin); maxMin = bar.high; acceleration = start;
    }
    if (!firstTrendBar) {
      if (below && bar.high > maxMin) { maxMin = bar.high; acceleration = Math.min(acceleration + increment, maximum); }
      if (!below && bar.low < maxMin) { maxMin = bar.low; acceleration = Math.min(acceleration + increment, maximum); }
    }
    result = below ? Math.min(result, one.low, two.low) : Math.max(result, one.high, two.high);
    return { index, result, maxMin, acceleration, below, bars };
  });
  return { update: (bar, replace) => ({ psar: sar.update(bar, replace).result }) };
}

/** TradingView's Ichimoku: Donchian midpoints; the spans' displacement is applied by the service (`plotOffsets`). */
function ichimoku(inputs: ResolvedInputs): BarKernel {
  const conversion = new RollingExtremes(numberInput(inputs, 'conversionPeriods'));
  const base = new RollingExtremes(numberInput(inputs, 'basePeriods'));
  const spanB = new RollingExtremes(numberInput(inputs, 'laggingSpan2Periods'));
  const middle = (extremes: { high: number; low: number } | null): number | null => (extremes ? (extremes.high + extremes.low) / 2 : null);
  return { update(bar, replace) {
    const conversionLine = middle(conversion.update(bar, replace));
    const baseLine = middle(base.update(bar, replace));
    return { conversion: conversionLine, base: baseLine, lagging: bar.close, leadB: middle(spanB.update(bar, replace)),
      leadA: conversionLine === null || baseLine === null ? null : (conversionLine + baseLine) / 2 };
  } };
}

/** Index of the newest maximum (or minimum) in a window, oldest first. */
const newestIndex = (values: readonly number[], better: (a: number, b: number) => boolean): number =>
  values.reduce((best, value, i) => (better(value, values[best] ?? value) || value === values[best] ? i : best), 0);

/** Aroon via `ta.highestbars(high, length + 1)`: 100 × the newest extreme's index / length. */
function aroon(inputs: ResolvedInputs): BarKernel {
  const length = numberInput(inputs, 'length');
  const highs = new RollingWindow(length + 1);
  const lows = new RollingWindow(length + 1);
  return { update(bar, replace) {
    const high = highs.update(bar.high, replace);
    const low = lows.update(bar.low, replace);
    if (!high || !low) return { up: null, down: null };
    return { up: 100 * newestIndex(high, (a, b) => a > b) / length, down: 100 * newestIndex(low, (a, b) => a < b) / length };
  } };
}

export const TREND_KERNELS: Record<string, BarKernelFactory> = { dmi, adx: onlyAdx, psar, ichimoku, aroon };
