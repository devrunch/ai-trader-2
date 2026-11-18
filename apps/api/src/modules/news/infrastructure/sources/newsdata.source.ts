import { z } from 'zod';
import type { SourceDescriptor } from '../../../../shared/sources';
import { KeyedThrottledSource } from './min-interval';
import type { NewsSource, RawHeadline } from '../../application/news';

export const NEWSDATA_DESCRIPTOR: SourceDescriptor = {
  id: 'newsdata', owner: 'news', kind: 'headlines', markets: ['us', 'india', 'forex', 'commodities', 'crypto'], envKeys: ['NEWSDATA_API_KEY'],
  rateLimit: { requests: 200, windowSec: 86_400 }, schedule: '0 */2 * * *',
  terms: 'newsdata.io /api/1/latest with our own key on the free plan (200 credits a day); wire-service and finance domains only, headline and link shown, at most every 2 hours: the free plan delays articles by 12 hours, so it is history and background, not breaking news.',
  docs: 'https://newsdata.io/documentation',
};

const Response = z.object({ results: z.array(z.object({ title: z.string().nullable(), link: z.string().nullable(), description: z.string().nullable().optional(),
  pubDate: z.string().nullable(), source_name: z.string().nullable().optional() })) });
// Domains newsdata.io knows (an unknown one fails the whole request; bloomberg.com is not in its database).
const DOMAINS = 'cnbc.com,marketwatch.com,wsj.com,economictimes.indiatimes.com,moneycontrol.com';
// The free plan rejects a query over 100 characters.
const QUERY = 'stocks OR inflation OR "Federal Reserve" OR gold OR crude OR bitcoin OR forex OR rupee';
const EVERY_MS = 2 * 3_600_000;

/** newsdata.io wire headlines; only with NEWSDATA_API_KEY. Its dates are "YYYY-MM-DD HH:MM:SS" in UTC. */
export class NewsdataSource extends KeyedThrottledSource implements NewsSource {
  readonly name = 'newsdata.io';
  readonly markets = ['us', 'forex', 'commodities', 'crypto'] as const;
  protected readonly everyMs = EVERY_MS;

  async fetch(signal: AbortSignal): Promise<RawHeadline[]> {
    if (!this.due()) return [];
    const url = `https://newsdata.io/api/1/latest?language=en&domainurl=${DOMAINS}&q=${encodeURIComponent(QUERY)}`;
    const { text } = await this.client.get(NEWSDATA_DESCRIPTOR.id, url, { headers: { 'X-ACCESS-KEY': this.key }, signal });
    const parsed = Response.parse(JSON.parse(text));
    const headlines = parsed.results.flatMap(r => {
      const publishedAt = Date.parse(`${(r.pubDate ?? '').replace(' ', 'T')}Z`);
      return r.title && r.link && Number.isFinite(publishedAt) ? [{ source: r.source_name ?? 'newsdata.io', title: r.title, url: r.link, summary: r.description ?? null, publishedAt }] : [];
    });
    if (parsed.results.length > 0 && headlines.length === 0) throw new Error('newsdata: results but none readable (the response changed shape)');
    await this.client.recordItems(NEWSDATA_DESCRIPTOR.id, headlines.length);
    return headlines;
  }
}
