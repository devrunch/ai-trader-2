import { anchorKey } from '../../domain/anchor';
import type { RuntimeContext } from '../../application/ports/indicator-runtime';
import type { ResolvedInputs } from '../../domain/inputs';
import type { Bar } from '@aitrader/contracts';
import type { BarKernel } from './bar-kernel';
import { stepper } from './extremes-kernel';

interface Day { key: string; high: number; low: number; close: number }
interface State { day: Day | undefined; before: Day | undefined }

const LEVELS = ['r5', 'r4', 'r3', 'r2', 'r1', 'p', 's1', 's2', 's3', 's4', 's5'] as const;

/** Traditional pivots from the previous day's high, low and close, with days cut in the exchange zone. `null` until a full day has passed. */
export function pivotKernel(_inputs: ResolvedInputs, context: RuntimeContext): BarKernel {
  const days = stepper<State>({ day: undefined, before: undefined }, ({ day, before }, bar: Bar) => {
    const key = anchorKey(bar.time, 'Session', context.timezone);
    if (day?.key !== key) return { day: { key, high: bar.high, low: bar.low, close: bar.close }, before: day };
    return { day: { key, high: Math.max(day.high, bar.high), low: Math.min(day.low, bar.low), close: bar.close }, before };
  });
  return { update(bar, replace) {
    const { before } = days.update(bar, replace);
    if (!before) return Object.fromEntries(LEVELS.map(id => [id, null]));
    const { high, low, close } = before;
    const p = (high + low + close) / 3;
    return { r5: p * 4 + (high - 4 * low), r4: p * 3 + (high - 3 * low), r3: p * 2 + (high - 2 * low), r2: p + (high - low), r1: p * 2 - low, p,
      s1: p * 2 - high, s2: p - (high - low), s3: p * 2 - (2 * high - low), s4: p * 3 - (3 * high - low), s5: p * 4 - (4 * high - low) };
  } };
}
