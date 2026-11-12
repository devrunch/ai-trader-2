import { DESK_LIMITS } from '@aitrader/contracts';

const DAY_MS = 86_400_000;
const utcDay = (iso: string): number => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? Date.parse(`${iso}T00:00:00Z`) : Number.NaN);

export interface GeneratedDates { dates: string[]; count: number; error: string | null }

/** Dates start, start+step, ... up to end inclusive; refuses more than the server limit. */
export function generateDates(start: string, end: string, step: number): GeneratedDates {
  const from = utcDay(start);
  const to = utcDay(end);
  const fail = (error: string, count = 0): GeneratedDates => ({ dates: [], count, error });
  if (Number.isNaN(from) || Number.isNaN(to)) return fail('Pick a start and end date.');
  if (!Number.isInteger(step) || step < 1) return fail('Step must be a whole number of days, 1 or more.');
  if (to < from) return fail('End date must be on or after the start date.');
  const count = Math.floor((to - from) / DAY_MS / step) + 1;
  if (count > DESK_LIMITS.maxBacktestDates) return fail(`${String(count)} dates is more than the limit of ${String(DESK_LIMITS.maxBacktestDates)}: widen the step or shorten the range.`, count);
  const dates = Array.from({ length: count }, (_, i) => new Date(from + i * step * DAY_MS).toISOString().slice(0, 10));
  return { dates, count, error: null };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `datetime-local` value to ISO with the browser's UTC offset (the API needs an offset). */
export function toOffsetIso(local: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(local);
  const date = new Date(local);
  if (!match || Number.isNaN(date.getTime())) return null;
  const offset = -date.getTimezoneOffset();
  const abs = Math.abs(offset);
  return `${match[1] ?? ''}:00${offset < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
