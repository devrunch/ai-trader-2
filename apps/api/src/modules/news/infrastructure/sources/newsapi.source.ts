import { z } from 'zod';
import type { SourceDescriptor } from '../../../../shared/sources';
import { KeyedThrottledSource } from './min-interval';
import type { NewsSource, RawHeadline } from '../../application/news';

export const NEWSAPI_DESCRIPTOR: SourceDescriptor = {
  id: 'newsapi', owner: 'news', kind: 'headlines', markets: ['global'], envKeys: ['NEWS_API_KEY'],
  rateLimit: { requests: 100, windowSec: 86_400 }, schedule: '0 * * * *',
  terms: 'newsapi.org /v2/everything with our own API key on the free developer plan (100 requests a day); finance outlets only, headline and link shown, at most hourly.',
  docs: 'https://newsapi.org/docs/endpoints/everything',
};

const NewsApiResponse = z.object({ articles: z.array(z.object({
  title: z.string().nullable(), url: z.string(), description: z.string().nullable(), publishedAt: z.string(), source: z.object({ name: z.string().nullable() }),
})) });
const MACRO_QUERY = '"Federal Reserve" OR "interest rate" OR inflation OR CPI OR dollar OR gold OR "crude oil" OR forex OR "stock market" OR Nasdaq OR "S&P 500" OR Nifty OR Sensex';

// Broad words like "gold" or "dollar" match sports and gossip elsewhere; finance outlets only.
const FINANCE_DOMAINS = ['reuters.com', 'bloomberg.com', 'cnbc.com', 'ft.com', 'wsj.com', 'marketwatch.com', 'finance.yahoo.com', 'investing.com',
  'fxstreet.com', 'kitco.com', 'oilprice.com', 'economictimes.indiatimes.com', 'livemint.com', 'business-standard.com', 'financialexpress.com'].join(',');

/** newsapi.org global macro headlines; only with NEWS_API_KEY. The free plan allows 100 requests a day, so the job calls it at most hourly. */
export class NewsApiSource extends KeyedThrottledSource implements NewsSource {
  readonly name = 'NewsAPI';
  protected readonly everyMs = 3_600_000;

  async fetch(signal: AbortSignal): Promise<RawHeadline[]> {
    if (!this.due()) return [];
    const url = `https://newsapi.org/v2/everything?language=en&sortBy=publishedAt&pageSize=50&searchIn=title&domains=${FINANCE_DOMAINS}&q=${encodeURIComponent(MACRO_QUERY)}`;
    const { text } = await this.client.get(NEWSAPI_DESCRIPTOR.id, url, { headers: { 'x-api-key': this.key }, signal });
    const articles = NewsApiResponse.parse(JSON.parse(text)).articles;
    const headlines = articles.flatMap(a => (a.title && a.title !== '[Removed]'
      ? [{ source: a.source.name ?? 'NewsAPI', title: a.title, url: a.url, summary: a.description, publishedAt: Date.parse(a.publishedAt) }] : []));
    await this.client.recordItems(NEWSAPI_DESCRIPTOR.id, headlines.length);
    return headlines;
  }
}
