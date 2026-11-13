const FRESH_MS = 24 * 3_600_000;

interface Dated { fetchedAt: string; reportDate: string | null }

/** Time machine: a record is visible at `asOf` only if it had been fetched and its latest results had been published by then. */
export function visibleAt(record: Dated, asOf: number): boolean {
  if (Date.parse(record.fetchedAt) > asOf) return false;
  return record.reportDate === null || Date.parse(`${record.reportDate}T23:59:59.999Z`) <= asOf;
}

export const isFresh = (record: Dated, now: number): boolean => now - Date.parse(record.fetchedAt) < FRESH_MS;

/** The last day of a results column heading such as "Sep 2025", or null for headings that are not a month (for example "TTM"). */
export function periodEnd(heading: string): string | null {
  const m = /^([A-Z][a-z]{2})\s+(\d{4})$/.exec(heading.trim());
  if (!m) return null;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m[1] ?? '');
  if (month < 0) return null;
  return new Date(Date.UTC(Number(m[2]), month + 1, 0)).toISOString().slice(0, 10);
}
