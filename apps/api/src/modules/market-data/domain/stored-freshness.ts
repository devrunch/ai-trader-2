import { addDaysToDate, dateAt } from './calendars/time';
import type { MarketCalendar } from './calendar';
import { bucketStart } from './grid';

const MINUTE = 60_000;
const DAY = 86_400_000;
const MAX_STALE_BARS = 3;
const MAX_STALE_DAYS = 5;
type ScanInterval = '15' | '60' | '1D';

const minutesOf = (interval: Exclude<ScanInterval, '1D'>): number => Number(interval);

/** A bar still forming is never scanned: an intraday bar closes with its interval or its session, a daily bar with its market's session. */
export function isBarClosed(start: number, interval: ScanInterval, now: number, cal: MarketCalendar): boolean {
  if (interval === '1D') return !(cal.isOpen(now) && bucketStart(now, '1D', cal) === start);
  if (now >= start + minutesOf(interval) * MINUTE) return true;
  const session = cal.sessionContaining(start);
  return session !== null && now >= session.close;
}

/** Milliseconds of open market between two instants (looks back at most 14 days). */
function openMs(cal: MarketCalendar, from: number, to: number): number {
  let total = 0;
  const first = dateAt(Math.max(from, to - 14 * DAY), cal.timezone);
  for (let date = addDaysToDate(first, -1); date <= dateAt(to, cal.timezone); date = addDaysToDate(date, 1)) {
    for (const s of cal.sessionsOn(date)) total += Math.max(0, Math.min(s.close, to) - Math.max(s.open, from));
  }
  return total;
}

/** Why the newest stored bar is too old to trust, or null when it is fresh: more than 3 bar intervals of market time, or for 1D more than 5 calendar days. */
export function staleReason(newest: number | null, interval: ScanInterval, now: number, cal: MarketCalendar): string | null {
  if (newest === null) return 'no stored bars';
  if (interval === '1D') {
    const days = Math.floor((now - newest) / DAY);
    return days > MAX_STALE_DAYS ? `newest daily bar is ${String(days)} days old (limit ${String(MAX_STALE_DAYS)})` : null;
  }
  const limit = minutesOf(interval) * MAX_STALE_BARS;
  const age = Math.floor(openMs(cal, newest, now) / MINUTE);
  return age > limit ? `newest bar is ${String(age)} min old during market hours (limit ${String(limit)})` : null;
}
