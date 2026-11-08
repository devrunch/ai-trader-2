import { TZDate, tzOffset } from '@date-fns/tz';
import { addDays, format, startOfISOWeek, startOfMonth } from 'date-fns';
import type { Interval } from '../interval';

export function localTime(date: string, time: string, timezone: string): number {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return new TZDate(year, month - 1, day, hour, minute, 0, 0, timezone).getTime();
}

export function dateAt(at: number, timezone: string): string {
  return format(new TZDate(at, timezone), 'yyyy-MM-dd');
}

export function addDaysToDate(date: string, days: number): string {
  return dateAt(addDays(new TZDate(localTime(date, '00:00', 'UTC'), 'UTC'), days).getTime(), 'UTC');
}

export function weekday(date: string): number { return new Date(`${date}T00:00:00Z`).getUTCDay(); }

export function newYorkDst(at: number): boolean { return tzOffset('America/New_York', new Date(at)) === -240; }

export function periodStart(date: string, interval: Interval, timezone: string): number {
  const value = new TZDate(localTime(date, '00:00', timezone), timezone);
  if (interval === '1W') return startOfISOWeek(value).getTime();
  if (interval === '1M') return startOfMonth(value).getTime();
  return value.getTime();
}
