import { z } from 'zod';
import type { SourceClient, SourceDescriptor } from '../../../shared/sources';
import type { EventSource, RawEvent } from '../application/calendar';

export const FF_WEEKLY_DESCRIPTOR: SourceDescriptor = {
  id: 'ff-weekly', owner: 'calendar', kind: 'economic calendar', markets: ['forex', 'global'], envKeys: [],
  // Two files per refresh (this week, next week), every 3 hours.
  rateLimit: { requests: 2, windowSec: 10_800 }, schedule: '7 */3 * * *',
  terms: 'ForexFactory weekly calendar JSON (nfs.faireconomy.media), the public feed the site publishes for its calendar; schedule, forecast and previous only, no actuals, fetched once every 3 hours.',
  docs: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
};

const FEEDS = ['https://nfs.faireconomy.media/ff_calendar_thisweek.json', 'https://nfs.faireconomy.media/ff_calendar_nextweek.json'];
const Row = z.object({
  title: z.string(), country: z.string(), date: z.string(), impact: z.string(),
  forecast: z.string().optional(), previous: z.string().optional(),
});
const IMPACTS = new Set(['High', 'Medium', 'Low', 'Holiday']);

/** ForexFactory's public weekly calendar (the feed asks for at most a couple of requests every few minutes). */
export class ForexFactorySource implements EventSource {
  constructor(private readonly client: SourceClient) {}

  async fetch(signal: AbortSignal): Promise<RawEvent[]> {
    // Next week's file is published late in the week; a 404 before then is normal.
    const pages = await Promise.all(FEEDS.map(url => this.page(url, signal, url.endsWith('nextweek.json'))));
    const events = pages.flat();
    await this.client.recordItems(FF_WEEKLY_DESCRIPTOR.id, events.length);
    return events;
  }

  private async page(url: string, signal: AbortSignal, optional: boolean): Promise<RawEvent[]> {
    const response = await this.client.get(FF_WEEKLY_DESCRIPTOR.id, url, { headers: { accept: 'application/json' }, signal, ...(optional ? { allowStatus: [404] } : {}) });
    if (optional && response.status === 404) return [];
    return z.array(Row).parse(JSON.parse(response.text)).flatMap(r => {
      const at = Date.parse(r.date);
      if (!Number.isFinite(at) || !IMPACTS.has(r.impact)) return [];
      return [{ title: r.title.trim(), country: r.country.trim().toUpperCase(), at: new Date(at).toISOString(), impact: r.impact as RawEvent['impact'],
        forecast: r.forecast?.trim() || null, previous: r.previous?.trim() || null }];
    });
  }
}
