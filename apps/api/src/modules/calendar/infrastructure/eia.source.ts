import { TZDate } from '@date-fns/tz';
import type { SourceClient, SourceDescriptor } from '../../../shared/sources';
import type { EventSource, RawEvent } from '../application/calendar';

export const EIA_DESCRIPTOR: SourceDescriptor = {
  id: 'eia', owner: 'calendar', kind: 'release schedule', markets: ['commodities', 'us'], envKeys: [],
  rateLimit: { requests: 1, windowSec: 21_600 }, schedule: '17 */6 * * *',
  terms: 'EIA Weekly Petroleum Status Report schedule page (public U.S. government data, robots.txt allows it); one page read every 6 hours; schedule only, no actuals (those need an EIA API key).',
  docs: 'https://www.eia.gov/petroleum/supply/weekly/schedule.php',
};

const URL = 'https://www.eia.gov/petroleum/supply/weekly/schedule.php';
const DAY = 86_400_000;
const ET = 'America/New_York';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ROW = /<tr[^>]*>\s*<th scope="row">([^<]+)<\/th>\s*<td>([^<]*)<\/td>\s*<td>[^<]*<\/td>\s*<td>([^<]*)<\/td>/g;

/** "November 12, 2026" to UTC midnight of that calendar day. */
function parseDay(text: string): number | null {
  const m = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(text.trim());
  const month = m ? MONTHS.indexOf(m[1] ?? '') : -1;
  return m && month >= 0 ? Date.UTC(Number(m[3]), month, Number(m[2])) : null;
}
function parseClock(text: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2}) ([ap])\.m\.$/.exec(text.trim());
  return m ? { hour: (Number(m[1]) % 12) + (m[3] === 'p' ? 12 : 0), minute: Number(m[2]) } : null;
}
const etInstant = (day: number, hour: number, minute: number): number => {
  const d = new Date(day);
  return new TZDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute, 0, ET).getTime();
};

/** Crude inventories come out Wednesdays 10:30 ET; the page lists only the holiday weeks, whose release moves (usually Thursday 12:00). */
export class EiaSource implements EventSource {
  constructor(private readonly client: SourceClient, private readonly now: () => number = Date.now, private readonly pastDays = 1, private readonly aheadDays = 30) {}

  async fetch(signal: AbortSignal): Promise<RawEvent[]> {
    const response = await this.client.get(EIA_DESCRIPTOR.id, URL, { headers: { accept: 'text/html' }, signal, maxBytes: 1_000_000 });
    const shifted = parseShifts(response.text);
    const from = this.now() - this.pastDays * DAY;
    const to = this.now() + this.aheadDays * DAY;
    const events: RawEvent[] = [];
    for (let day = nextWednesday(from - DAY); day <= to + DAY; day += 7 * DAY) {
      const at = shifted.get(day) ?? etInstant(day, 10, 30);
      if (at >= from && at <= to) events.push({ title: 'Crude Oil Inventories', country: 'USD', at: new Date(at).toISOString(), impact: 'High', forecast: null, previous: null });
    }
    await this.client.recordItems(EIA_DESCRIPTOR.id, shifted.size);
    return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }
}

/** Map from the normal Wednesday (week-ending Friday + 5 days, UTC midnight) to the instant of the shifted release. */
function parseShifts(html: string): Map<number, number> {
  const out = new Map<number, number>();
  const rows = [...html.matchAll(ROW)];
  if (rows.length === 0) throw new Error('EIA schedule page: no schedule rows found (page shape changed)');
  for (const [, weekEnding = '', alternate = '', time = ''] of rows) {
    const friday = parseDay(weekEnding), moved = parseDay(alternate), clock = parseClock(time);
    if (friday === null || moved === null || clock === null) throw new Error(`EIA schedule page: unreadable row "${weekEnding}"`);
    out.set(friday + 5 * DAY, etInstant(moved, clock.hour, clock.minute));
  }
  return out;
}

function nextWednesday(after: number): number {
  const midnight = Math.floor(after / DAY) * DAY;
  const weekday = new Date(midnight).getUTCDay();
  return midnight + (((3 - weekday + 7) % 7) || 7) * DAY;
}
