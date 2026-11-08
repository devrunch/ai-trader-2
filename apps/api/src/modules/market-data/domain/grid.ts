import type { MarketCalendar } from './calendar';
import { intervalMinutes } from './interval';
import type { Interval } from './interval';
import { addDaysToDate, dateAt, localTime, periodStart } from './calendars/time';

export function bucketStart(at: number, interval: Interval, cal: MarketCalendar): number | null {
  const minutes = intervalMinutes(interval);
  const fx = cal.id === 'FX' || cal.id === 'OANDA';
  if (minutes !== null) {
    const session = cal.sessionContaining(at);
    if (!session) return null;
    const anchor = fx ? 0 : session.open;
    const size = minutes * 60000;
    return anchor + Math.floor((at - anchor) / size) * size;
  }
  const date = dateAt(at, cal.timezone);
  if (fx && interval === '1D') {
    if (!cal.isOpen(at)) return null;
    const nyDate = dateAt(at, 'America/New_York');
    const cutover = localTime(nyDate, '17:00', 'America/New_York');
    return at >= cutover ? cutover : localTime(addDaysToDate(nyDate, -1), '17:00', 'America/New_York');
  }
  if (!cal.sessionsOn(date).length) return null;
  return periodStart(date, interval, cal.timezone);
}
