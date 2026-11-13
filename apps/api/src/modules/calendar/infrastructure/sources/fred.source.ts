import { z } from 'zod';
import type { SourceClient, SourceDescriptor } from '../../../../shared/sources';
import type { ActualObservation, ActualsSource, EventRef } from '../../application/ports/actuals-source';
import { FRED_MAPPINGS, formatRelease, monthsBefore, referenceDate, type FredMapping } from '../../domain/fred-series';

export const FRED_DESCRIPTOR: SourceDescriptor = {
  id: 'fred', owner: 'calendar', kind: 'US macro actuals', markets: ['us', 'forex', 'gold'], envKeys: ['FRED_API_KEY'], rateLimit: { requests: 100, windowSec: 60 }, schedule: 'event-actuals (every minute near a US release)',
  terms: 'FRED API series/observations with a free key (120 requests/min allowed); curated series only, one request per US event near its release time, values shown with attribution to the St. Louis Fed.',
  docs: 'https://fred.stlouisfed.org/docs/api/fred/series_observations.html',
};

const Response = z.object({ observations: z.array(z.object({ date: z.string(), value: z.string() })) });
const BASE = 'https://api.stlouisfed.org/fred/series/observations';

/** US actuals from FRED: the observation dated the event's reference period, turned into the figure ForexFactory prints. Off without a key. */
export class FredActuals implements ActualsSource {
  constructor(private readonly client: SourceClient, private readonly apiKey: string | undefined) {}

  async fetch(events: EventRef[], signal: AbortSignal): Promise<ActualObservation[]> {
    if (!this.apiKey?.trim()) return [];
    const results = await Promise.all(events.filter(e => e.country === 'USD').map(e => this.one(e, signal)));
    const found = results.flatMap(r => (r ? [r] : []));
    if (found.length > 0) await this.client.recordItems(FRED_DESCRIPTOR.id, found.length);
    return found;
  }

  /** undefined: not a mapped event (nothing asked); null: asked, but the period's value is not published yet. */
  private async one(event: EventRef, signal: AbortSignal): Promise<ActualObservation | null | undefined> {
    const mapping: FredMapping | undefined = FRED_MAPPINGS[event.title];
    if (!mapping) return undefined;
    const date = referenceDate(mapping.period, Date.parse(event.at));
    const response = await this.client.get(FRED_DESCRIPTOR.id, this.url(mapping, date), { headers: { accept: 'application/json' }, signal });
    const values = new Map<string, number>();
    for (const o of Response.parse(JSON.parse(response.text)).observations) {
      const value = Number(o.value);
      if (o.value !== '.' && Number.isFinite(value)) values.set(o.date, value);
    }
    const actual = formatRelease(mapping.transform, date, values);
    return actual === null ? null : { eventId: event.id, actual, source: FRED_DESCRIPTOR.id };
  }

  private url(mapping: FredMapping, date: string): string {
    const lag = mapping.transform.kind === 'pct-change' ? mapping.transform.lagMonths : mapping.transform.kind === 'diff-thousands' ? 1 : 0;
    const start = lag === 0 ? date : monthsBefore(date, lag);
    const query = new URLSearchParams({ series_id: mapping.series, api_key: this.apiKey ?? '', file_type: 'json', observation_start: start, observation_end: date, sort_order: 'asc', limit: '30' });
    return `${BASE}?${query.toString()}`;
  }
}
