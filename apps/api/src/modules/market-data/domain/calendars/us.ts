// source: https://www.nyse.com/markets/hours-calendars and NYSE Rule 7.2.
// Saturday New Year does not close the preceding year-end accounting day.
export function usHoliday(date: string): boolean {
  const year = Number(date.slice(0, 4));
  const fixed = [[1, 1], [6, 19], [7, 4], [12, 25]] as const;
  for (const [month, day] of fixed) {
    const value = new Date(Date.UTC(year, month - 1, day));
    const weekday = value.getUTCDay();
    if (weekday === 6 && month !== 1) value.setUTCDate(value.getUTCDate() - 1);
    if (weekday === 0) value.setUTCDate(value.getUTCDate() + 1);
    if (date === iso(value)) return true;
  }
  return [nthWeekday(year, 1, 1, 3), nthWeekday(year, 2, 1, 3), goodFriday(year), nthWeekday(year, 5, 1, -1), nthWeekday(year, 9, 1, 1), nthWeekday(year, 11, 4, 4)].includes(date);
}

export function usHalfDay(date: string): boolean {
  const year = Number(date.slice(0, 4));
  const thanksgiving = new Date(`${nthWeekday(year, 11, 4, 4)}T00:00:00Z`);
  thanksgiving.setUTCDate(thanksgiving.getUTCDate() + 1);
  return date.endsWith('-07-03') || date.endsWith('-12-24') || date === iso(thanksgiving);
}

function nthWeekday(year: number, month: number, weekday: number, ordinal: number): string {
  const value = new Date(Date.UTC(year, ordinal < 0 ? month : month - 1, ordinal < 0 ? 0 : 1));
  const delta = ordinal < 0 ? -((value.getUTCDay() - weekday + 7) % 7) : (weekday - value.getUTCDay() + 7) % 7 + (ordinal - 1) * 7;
  value.setUTCDate(value.getUTCDate() + delta);
  return iso(value);
}

function goodFriday(year: number): string {
  // Gregorian computus (Meeus/Jones/Butcher), followed by Easter minus two days.
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451), total = h + l - 7 * m + 114;
  return iso(new Date(Date.UTC(year, Math.floor(total / 31) - 1, total % 31 - 1)));
}

function iso(value: Date): string { return value.toISOString().slice(0, 10); }
