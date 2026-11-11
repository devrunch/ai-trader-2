import { XMLParser } from 'fast-xml-parser';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { NewsSource, RawHeadline } from '../application/news';

const parser = new XMLParser({ ignoreAttributes: true, processEntities: true, htmlEntities: true, trimValues: true });
const text = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
// Feeds put HTML inside CDATA, where XML leaves entities alone; decode the common ones after dropping tags.
const decode = (value: string): string => value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
  if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
  if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
  return ENTITIES[code.toLowerCase()] ?? whole;
});
const stripTags = (value: string): string => decode(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const UA = 'AI-Trader-News/1.0';

/** Public RSS 2.0 market feeds; no key. Titles and summaries are plain text after this. */
export const RSS_FEEDS: Array<{ name: string; url: string }> = [
  { name: 'Economic Times', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { name: 'Livemint', url: 'https://www.livemint.com/rss/markets' },
  { name: 'Business Standard', url: 'https://www.business-standard.com/rss/markets-106.rss' },
  { name: 'CNBC-TV18', url: 'https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml' },
  { name: 'BusinessLine', url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss' },
  { name: 'Investing.com', url: 'https://www.investing.com/rss/news_25.rss' },
  { name: 'Yahoo Finance', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EIXIC,GC%3DF,CL%3DF,EURUSD%3DX&region=US&lang=en-US' },
];

export class RssSource implements NewsSource {
  constructor(readonly name: string, private readonly url: string) {}

  async fetch(signal: AbortSignal): Promise<RawHeadline[]> {
    const body = await withTimeout(async inner => {
      const res = await fetch(this.url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.any([inner, signal]) });
      if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
      return res.text();
    }, 10_000);
    return parseRss(this.name, body);
  }
}

/** RFC 822 dates, plus the bare "YYYY-MM-DD HH:MM:SS" some feeds use, which is UTC. */
function parseDate(value: string): number {
  const bare = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(value.trim());
  return bare ? Date.parse(`${bare[1] ?? ''}T${bare[2] ?? ''}Z`) : Date.parse(value);
}

export function parseRss(source: string, xml: string): RawHeadline[] {
  const doc: unknown = parser.parse(xml);
  const channel = (doc as { rss?: { channel?: { item?: unknown } } }).rss?.channel;
  const raw = channel?.item;
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return items.flatMap((item: Record<string, unknown>) => {
    const title = stripTags(text(item.title));
    const url = text(item.link).trim();
    const published = parseDate(text(item.pubDate));
    if (!title || !url || Number.isNaN(published)) return [];
    const summary = stripTags(text(item.description));
    return [{ source, title, url, summary: summary || null, publishedAt: published }];
  });
}

const NewsApiResponse = z.object({ articles: z.array(z.object({
  title: z.string().nullable(), url: z.string(), description: z.string().nullable(), publishedAt: z.string(), source: z.object({ name: z.string().nullable() }),
})) });
const MACRO_QUERY = '"Federal Reserve" OR "interest rate" OR inflation OR CPI OR dollar OR gold OR "crude oil" OR forex OR "stock market" OR Nasdaq OR "S&P 500" OR Nifty OR Sensex';

// Broad words like "gold" or "dollar" match sports and gossip elsewhere; finance outlets only.
const FINANCE_DOMAINS = ['reuters.com', 'bloomberg.com', 'cnbc.com', 'ft.com', 'wsj.com', 'marketwatch.com', 'finance.yahoo.com', 'investing.com',
  'fxstreet.com', 'kitco.com', 'oilprice.com', 'economictimes.indiatimes.com', 'livemint.com', 'business-standard.com', 'financialexpress.com'].join(',');

/** newsapi.org global macro headlines; only with NEWS_API_KEY. The free plan allows 100 requests a day, so the job calls it at most hourly. */
export class NewsApiSource implements NewsSource {
  readonly name = 'NewsAPI';
  private lastCall = 0;
  constructor(private readonly key: string, private readonly clock: () => number = Date.now) {}

  async fetch(signal: AbortSignal): Promise<RawHeadline[]> {
    if (this.clock() - this.lastCall < 3_600_000) return [];
    this.lastCall = this.clock();
    const url = `https://newsapi.org/v2/everything?language=en&sortBy=publishedAt&pageSize=50&searchIn=title&domains=${FINANCE_DOMAINS}&q=${encodeURIComponent(MACRO_QUERY)}`;
    const body = await withTimeout(async inner => {
      const res = await fetch(url, { headers: { 'x-api-key': this.key, 'user-agent': UA }, signal: AbortSignal.any([inner, signal]) });
      if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
      return res.json() as Promise<unknown>;
    }, 10_000);
    return NewsApiResponse.parse(body).articles.flatMap(a => (a.title && a.title !== '[Removed]'
      ? [{ source: a.source.name ?? 'NewsAPI', title: a.title, url: a.url, summary: a.description, publishedAt: Date.parse(a.publishedAt) }] : []));
  }
}
