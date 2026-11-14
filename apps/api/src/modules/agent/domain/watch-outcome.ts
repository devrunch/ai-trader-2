import type { WatchItem } from '@aitrader/contracts';

/** A move smaller than this is noise, not a call coming true. */
const MIN_MOVE_PCT = 0.3;
const VOLATILE_PCT = 1;

/** How an item turned out from the move of its first symbol since it was written. "Watch" items make no directional call, so they are never scored. */
export function judge(item: Pick<WatchItem, 'direction'>, movePct: number | null): WatchItem['outcome'] {
  if (movePct === null || item.direction === 'watch') return 'unclear';
  if (item.direction === 'volatile') return Math.abs(movePct) >= VOLATILE_PCT ? 'right' : 'wrong';
  if (Math.abs(movePct) < MIN_MOVE_PCT) return 'wrong';
  return (item.direction === 'up') === movePct > 0 ? 'right' : 'wrong';
}

/** When an item is due to be judged: end of the IST trading day for "today" (16:00 IST), seven days later for "this week". */
export function dueAt(createdAt: number, horizon: WatchItem['horizon']): number {
  if (horizon === 'this week') return createdAt + 7 * 86_400_000;
  const IST = 19_800_000;
  const dayStart = createdAt - ((createdAt + IST) % 86_400_000);
  const close = dayStart + 16 * 3_600_000;
  return close > createdAt ? close : close + 86_400_000;
}
