import type { MarketCalendar, SessionWindow } from '../domain/calendar';

// Aggregation walks sorted minutes: reuse the containing session rather than redoing timezone conversion per row.
export function sessionCache(calendar: MarketCalendar): MarketCalendar {
  let previous: SessionWindow | null = null;
  return {
    id: calendar.id, timezone: calendar.timezone,
    sessionsOn: date => calendar.sessionsOn(date), isOpen: at => calendar.isOpen(at), nextOpen: at => calendar.nextOpen(at),
    sessionContaining: at => {
      if (previous && at >= previous.open && at < previous.close) return previous;
      previous = calendar.sessionContaining(at);
      return previous;
    },
  };
}
