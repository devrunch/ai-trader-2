export const MINUTE_MS = 60_000;

/** Start of the minute containing `ms`. */
export function minuteStart(ms: number): number { return Math.floor(ms / MINUTE_MS) * MINUTE_MS; }

/** Percent change from `from` to `to`; null when `from` is not a positive price. */
export function percentChange(from: number, to: number): number | null {
  return from > 0 && Number.isFinite(to) ? (to / from - 1) * 100 : null;
}
