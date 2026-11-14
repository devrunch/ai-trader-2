import { z } from 'zod';
import type { SourceDescriptor } from '../../../../shared/sources';
import { KeyedThrottledSource } from './min-interval';
import type { NewsSource, RawHeadline } from '../../application/news';

export const ALPHAVANTAGE_NEWS_DESCRIPTOR: SourceDescriptor = {
  id: 'alphavantage-news', owner: 'news', kind: 'headlines', markets: ['us', 'forex', 'crypto'], envKeys: ['ALPHAVANTAGE_API_KEY'],
  rateLimit: { requests: 25, windowSec: 86_400 }, schedule: '0 */2 * * *',
  terms: 'Alpha Vantage NEWS_SENTIMENT with our own key on the free plan (25 requests a day); headline, link and summary, every two hours. Its vendor sentiment is not used, so one scorer judges every headline.',
  docs: 'https://www.alphavantage.co/documentation/#news-sentiment',
};

const Response = z.object({ feed: z.array(z.object({ title: z.string(), url: z.string(), summary: z.string().optional(), time_published: z.string(), source: z.string().optional() })).optional(),
  Note: z.string().optional(), Information: z.string().optional(), 'Error Message': z.string().optional() });
const EVERY_MS = 2 * 3_600_000;

/** "20261112T093000" in UTC. */
const parseTime = (value: string): number => {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value);
  return m ? Date.parse(`${m[1] ?? ''}-${m[2] ?? ''}-${m[3] ?? ''}T${m[4] ?? ''}:${m[5] ?? ''}:${m[6] ?? ''}Z`) : Number.NaN;
};

/** Alpha Vantage market news; only with ALPHAVANTAGE_API_KEY. It reports throttling and key problems in-band with HTTP 200, which is an error here. */
export class AlphaVantageNewsSource extends KeyedThrottledSource implements NewsSource {
  readonly name = 'Alpha Vantage';
  readonly markets = ['us', 'forex', 'crypto'] as const;
  protected readonly everyMs = EVERY_MS;

  async fetch(signal: AbortSignal): Promise<RawHeadline[]> {
    if (!this.due()) return [];
    const { text } = await this.client.get(ALPHAVANTAGE_NEWS_DESCRIPTOR.id, `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=financial_markets&sort=LATEST&limit=50&apikey=${encodeURIComponent(this.key)}`, { signal, timeoutMs: 15_000 });
    const parsed = Response.parse(JSON.parse(text));
    if (!parsed.feed) throw new Error(`alphavantage: no feed (${(parsed.Note ?? parsed.Information ?? parsed['Error Message'] ?? 'the response changed shape').slice(0, 120)})`);
    const headlines = parsed.feed.flatMap(f => (Number.isFinite(parseTime(f.time_published))
      ? [{ source: f.source ?? 'Alpha Vantage', title: f.title, url: f.url, summary: f.summary ?? null, publishedAt: parseTime(f.time_published) }] : []));
    await this.client.recordItems(ALPHAVANTAGE_NEWS_DESCRIPTOR.id, headlines.length);
    return headlines;
  }
}
