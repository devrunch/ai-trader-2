export type SecondInterval = '1S' | '5S' | '15S' | '30S';
export type Interval = SecondInterval | '1' | '3' | '5' | '15' | '30' | '60' | '240' | '1D' | '1W' | '1M';

export const INTERVALS: readonly Interval[] = ['1S', '5S', '15S', '30S', '1', '3', '5', '15', '30', '60', '240', '1D', '1W', '1M'];

export class InvalidIntervalError extends Error {
  readonly code = 'VALIDATION_FAILED' as const;
  constructor(raw: string) {
    super(`Invalid interval: ${raw}`);
    this.name = 'InvalidIntervalError';
  }
}

export function parseInterval(raw: string): Interval {
  const interval = INTERVALS.find(value => value === raw);
  if (!interval) throw new InvalidIntervalError(raw);
  return interval;
}

export function isSecondInterval(i: Interval): i is SecondInterval { return i.endsWith('S'); }

export function intervalSeconds(i: SecondInterval): number { return Number.parseInt(i, 10); }

/** Minutes of an intraday minute-based interval; null for second, daily and longer intervals. */
export function intervalMinutes(i: Interval): number | null {
  return i === '1D' || i === '1W' || i === '1M' || isSecondInterval(i) ? null : Number(i);
}
