/** How a ForexFactory USD release maps to a FRED series, which observation date belongs to the release, and how to turn FRED's value into the figure FF prints. */
export type ReferencePeriod = 'prev-month' | 'prev-quarter' | 'event-day' | 'prev-saturday';
export type FredTransform =
  | { kind: 'level'; decimals: number; suffix: '%' | '' }
  /** Percent change from the observation `lag` months earlier (1 = m/m, 12 = y/y). */
  | { kind: 'pct-change'; lagMonths: number }
  /** Level change in thousands (payrolls). */
  | { kind: 'diff-thousands' }
  /** Level in persons shown in thousands (jobless claims). */
  | { kind: 'thousands' };
export interface FredMapping { series: string; period: ReferencePeriod; transform: FredTransform }

const mom: FredTransform = { kind: 'pct-change', lagMonths: 1 };
const yoy: FredTransform = { kind: 'pct-change', lagMonths: 12 };
const gdp: FredMapping = { series: 'A191RL1Q225SBEA', period: 'prev-quarter', transform: { kind: 'level', decimals: 1, suffix: '%' } };

/** Curated: the US releases that FRED publishes the same day. Keys are ForexFactory titles. */
export const FRED_MAPPINGS: Readonly<Record<string, FredMapping>> = {
  'CPI m/m': { series: 'CPIAUCSL', period: 'prev-month', transform: mom },
  'CPI y/y': { series: 'CPIAUCNS', period: 'prev-month', transform: yoy },
  'Core CPI m/m': { series: 'CPILFESL', period: 'prev-month', transform: mom },
  'Core CPI y/y': { series: 'CPILFENS', period: 'prev-month', transform: yoy },
  'Core PCE Price Index m/m': { series: 'PCEPILFE', period: 'prev-month', transform: mom },
  'PPI m/m': { series: 'PPIFIS', period: 'prev-month', transform: mom },
  'Retail Sales m/m': { series: 'RSAFS', period: 'prev-month', transform: mom },
  'Industrial Production m/m': { series: 'INDPRO', period: 'prev-month', transform: mom },
  'Average Hourly Earnings m/m': { series: 'CES0500000003', period: 'prev-month', transform: mom },
  'Unemployment Rate': { series: 'UNRATE', period: 'prev-month', transform: { kind: 'level', decimals: 1, suffix: '%' } },
  'Non-Farm Employment Change': { series: 'PAYEMS', period: 'prev-month', transform: { kind: 'diff-thousands' } },
  'Unemployment Claims': { series: 'ICSA', period: 'prev-saturday', transform: { kind: 'thousands' } },
  'Federal Funds Rate': { series: 'DFEDTARU', period: 'event-day', transform: { kind: 'level', decimals: 2, suffix: '%' } },
  'Advance GDP q/q': gdp, 'Prelim GDP q/q': gdp, 'Final GDP q/q': gdp,
};

const ymd = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

/** The observation date (YYYY-MM-DD) whose value the release at `atMs` reports: monthly and quarterly series are dated the first day of their period. */
export function referenceDate(period: ReferencePeriod, atMs: number): string {
  const d = new Date(atMs);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  switch (period) {
    case 'prev-month': return ymd(Date.UTC(year, month - 1, 1));
    case 'prev-quarter': return ymd(Date.UTC(year, month - (month % 3) - 3, 1));
    case 'event-day': return ymd(atMs);
    case 'prev-saturday': return ymd(atMs - ((d.getUTCDay() + 1) % 7 || 7) * DAY);
  }
}

/** The first day of the month `lag` months before the given first-of-month date. */
export function monthsBefore(date: string, lag: number): string {
  const [y, m] = date.split('-').map(Number);
  return ymd(Date.UTC(y ?? 0, (m ?? 1) - 1 - lag, 1));
}
const round = (n: number, decimals: number): number => Math.round(n * 10 ** decimals) / 10 ** decimals + 0;

/** The figure as ForexFactory prints it ('0.3%', '225K'), or null when an input is missing. `values` maps observation date to FRED value. */
export function formatRelease(transform: FredTransform, date: string, values: ReadonlyMap<string, number>): string | null {
  const value = values.get(date);
  if (value === undefined) return null;
  switch (transform.kind) {
    case 'level': return `${round(value, transform.decimals).toFixed(transform.decimals)}${transform.suffix}`;
    case 'thousands': return `${String(Math.round(value / 1000))}K`;
    case 'diff-thousands': {
      const before = values.get(monthsBefore(date, 1));
      return before === undefined ? null : `${String(Math.round(value - before))}K`;
    }
    case 'pct-change': {
      const before = values.get(monthsBefore(date, transform.lagMonths));
      return before === undefined || before === 0 ? null : `${round((value / before - 1) * 100, 1).toFixed(1)}%`;
    }
  }
}
