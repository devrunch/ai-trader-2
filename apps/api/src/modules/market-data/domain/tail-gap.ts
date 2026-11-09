import type { MarketCalendar } from './calendar';
import { dateAt } from './calendars/time';

const MINUTE = 60_000;
const LIVE_SLACK = 2 * MINUTE;
const LOOKBACK_DAYS = 10;

/**
 * Minutes missing after the newest stored 1-minute bar, up to the last minute that should exist now
 * (the forming minute excluded while the session is open). Null when the tail is complete.
 */
export function tailGap(cal: MarketCalendar, lastBar: number | undefined, now: number): { from: number; to: number } | null {
  if (lastBar === undefined) return null;
  const open = cal.sessionContaining(now) !== null;
  const end = open ? Math.floor(now / MINUTE) * MINUTE : lastClose(cal, now);
  if (end === null) return null;
  const from = lastBar + MINUTE;
  return from >= end - (open ? LIVE_SLACK : 0) ? null : { from, to: end };
}

function lastClose(cal: MarketCalendar, now: number): number | null {
  for (let day = 0; day < LOOKBACK_DAYS; day++) {
    const closes = cal.sessionsOn(dateAt(now - day * 86_400_000, cal.timezone)).map(s => s.close).filter(close => close <= now);
    if (closes.length) return Math.max(...closes);
  }
  return null;
}
