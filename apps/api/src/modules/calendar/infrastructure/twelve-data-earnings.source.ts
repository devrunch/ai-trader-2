import { TZDate } from '@date-fns/tz';
import { z } from 'zod';
import type { SourceClient, SourceDescriptor } from '../../../shared/sources';
import type { EventSource, RawEvent } from '../application/calendar';

export const TWELVE_DATA_EARNINGS_DESCRIPTOR: SourceDescriptor = {
  id: 'twelve-data-earnings', owner: 'calendar', kind: 'earnings calendar', markets: ['us'], envKeys: ['TWELVE_DATA_API_KEY'],
  // The free plan is 8 requests a minute; one batched request every 6 hours uses far less.
  rateLimit: { requests: 8, windowSec: 60 }, schedule: '23 */6 * * *',
  terms: 'Twelve Data /earnings_calendar with our own API key (40 credits per request); the endpoint needs the Grow plan or above, so a free key gets HTTP 403 and the source reports failing; one request for the next 14 days, filtered to the US large-cap universe.',
  docs: 'https://twelvedata.com/docs/fundamentals/earnings-calendar',
};

const URL = 'https://api.twelvedata.com/earnings_calendar';
const DAY = 86_400_000;
const TOP = 15;
const Response = z.object({
  earnings: z.record(z.string(), z.array(z.object({ symbol: z.string(), time: z.string().nullish(), eps_estimate: z.number().nullish() }))),
});
/** Approximate ET release moments: the feed only says before the open, after the close or unknown. */
const CLOCK: Readonly<Record<string, [number, number]>> = { 'Pre Market': [8, 0], 'After Hours': [16, 30] };

export interface UniverseMembers { members(universe: 'us-large', userId: string): Promise<Array<{ symbol: string }>> }

/** Earnings dates of the US large-cap universe for the next two weeks; off (empty) when no API key is set. */
export class TwelveDataEarningsSource implements EventSource {
  constructor(private readonly client: SourceClient, private readonly apiKey: string | undefined, private readonly universe: UniverseMembers,
    private readonly now: () => number = Date.now, private readonly aheadDays = 14) {}

  async fetch(signal: AbortSignal): Promise<RawEvent[]> {
    if (!this.apiKey?.trim()) return [];
    const members = await this.universe.members('us-large', '');
    const tickers = new Map(members.map((m, i) => [m.symbol.slice(m.symbol.indexOf(':') + 1), i]));
    const day = (offset: number): string => new Date(this.now() + offset * DAY).toISOString().slice(0, 10);
    const url = `${URL}?${new URLSearchParams({ start_date: day(0), end_date: day(this.aheadDays), country: 'United States' }).toString()}`;
    const response = await this.client.get(TWELVE_DATA_EARNINGS_DESCRIPTOR.id, url, { headers: { accept: 'application/json', authorization: `apikey ${this.apiKey.trim()}` }, signal });
    const parsed = Response.parse(JSON.parse(response.text));
    const events: RawEvent[] = Object.entries(parsed.earnings).flatMap(([date, rows]) => rows.flatMap(r => {
      const rank = tickers.get(r.symbol);
      const [hour, minute] = CLOCK[r.time ?? ''] ?? [16, 0];
      const [y, m, d] = date.split('-').map(Number);
      if (rank === undefined || y === undefined || m === undefined || d === undefined) return [];
      return [{ title: `${r.symbol} earnings`, country: 'USD', at: new Date(new TZDate(y, m - 1, d, hour, minute, 0, 'America/New_York').getTime()).toISOString(),
        impact: rank < TOP ? 'High' : 'Medium', forecast: r.eps_estimate == null ? null : `EPS ${String(r.eps_estimate)}`, previous: null } satisfies RawEvent];
    })).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    await this.client.recordItems(TWELVE_DATA_EARNINGS_DESCRIPTOR.id, events.length);
    return events;
  }
}
