import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { EventSource, RawEvent } from '../application/calendar';

const UA = 'Mozilla/5.0 (compatible; AITrader/1.0)';
const FEEDS = ['https://nfs.faireconomy.media/ff_calendar_thisweek.json', 'https://nfs.faireconomy.media/ff_calendar_nextweek.json'];
const Row = z.object({
  title: z.string(), country: z.string(), date: z.string(), impact: z.string(),
  forecast: z.string().optional(), previous: z.string().optional(),
});
const IMPACTS = new Set(['High', 'Medium', 'Low', 'Holiday']);

/** ForexFactory's public weekly calendar (the feed asks for at most a couple of requests every few minutes). */
export class ForexFactorySource implements EventSource {
  async fetch(signal: AbortSignal): Promise<RawEvent[]> {
    const pages = await Promise.all(FEEDS.map(url => this.page(url, signal).catch((error: unknown) => {
      // Next week's file is published late in the week; a 404 before then is normal.
      if (url.endsWith('nextweek.json')) return [];
      throw error;
    })));
    return pages.flat();
  }

  private async page(url: string, signal: AbortSignal): Promise<RawEvent[]> {
    const body = await withTimeout(async inner => {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.any([inner, signal]) });
      if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
      return res.json() as Promise<unknown>;
    }, 10_000);
    return z.array(Row).parse(body).flatMap(r => {
      const at = Date.parse(r.date);
      if (!Number.isFinite(at) || !IMPACTS.has(r.impact)) return [];
      return [{ title: r.title.trim(), country: r.country.trim().toUpperCase(), at: new Date(at).toISOString(), impact: r.impact as RawEvent['impact'],
        forecast: r.forecast?.trim() || null, previous: r.previous?.trim() || null }];
    });
  }
}
