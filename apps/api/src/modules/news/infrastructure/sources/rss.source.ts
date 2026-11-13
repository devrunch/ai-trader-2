import { XMLParser } from 'fast-xml-parser';
import type { NewsMarket } from '@aitrader/contracts';
import type { SourceClient, SourceDescriptor } from '../../../../shared/sources';
import type { NewsSource, RawHeadline } from '../../application/news';

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

/** Public RSS 2.0 market feeds; no key. `markets` is what a feed covers when a headline names no instrument. Titles and summaries are plain text after this. */
export const RSS_FEEDS: ReadonlyArray<{ id: string; name: string; url: string; markets: readonly NewsMarket[] }> = [
  { id: 'rss-et', name: 'Economic Times', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', markets: ['india'] },
  { id: 'rss-mint', name: 'Livemint', url: 'https://www.livemint.com/rss/markets', markets: ['india'] },
  { id: 'rss-bs', name: 'Business Standard', url: 'https://www.business-standard.com/rss/markets-106.rss', markets: ['india'] },
  { id: 'rss-cnbctv18', name: 'CNBC-TV18', url: 'https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml', markets: ['india'] },
  { id: 'rss-businessline', name: 'BusinessLine', url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss', markets: ['india'] },
  { id: 'rss-investing', name: 'Investing.com', url: 'https://www.investing.com/rss/news_25.rss', markets: ['us'] },
  { id: 'rss-yahoo-index', name: 'Yahoo Finance', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EIXIC,GC%3DF,CL%3DF,EURUSD%3DX&region=US&lang=en-US', markets: ['us', 'forex', 'commodities'] },
  { id: 'rss-investing-forex', name: 'Investing.com Forex', url: 'https://www.investing.com/rss/news_1.rss', markets: ['forex'] },
  { id: 'rss-investing-commodities', name: 'Investing.com Commodities', url: 'https://www.investing.com/rss/news_11.rss', markets: ['commodities'] },
  { id: 'rss-fxstreet', name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news', markets: ['forex'] },
  { id: 'rss-oilprice', name: 'OilPrice.com', url: 'https://oilprice.com/rss/main', markets: ['commodities'] },
  { id: 'rss-coindesk', name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', markets: ['crypto'] },
  { id: 'rss-cointelegraph', name: 'Cointelegraph', url: 'https://cointelegraph.com/rss', markets: ['crypto'] },
  { id: 'rss-cnbc-markets', name: 'CNBC Markets', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', markets: ['us'] },
  { id: 'rss-marketwatch', name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse', markets: ['us'] },
];

/** One descriptor per feed. Headroom of 3 per 5 minutes lets a restart or a manual run fetch again without waiting; the job itself runs every 5 minutes. */
export const RSS_DESCRIPTORS: SourceDescriptor[] = RSS_FEEDS.map(feed => ({
  id: feed.id, owner: 'news', kind: 'headlines', markets: [...feed.markets], envKeys: [],
  rateLimit: { requests: 3, windowSec: 300 }, schedule: '*/5 * * * *',
  terms: `${feed.name}'s public market RSS feed (${new URL(feed.url).host}); headline, link and summary only, one request per 5 minutes, linked back to the publisher.`,
  docs: feed.url,
}));

export class RssSource implements NewsSource {
  constructor(readonly name: string, private readonly sourceId: string, private readonly url: string, private readonly client: SourceClient, readonly markets: readonly NewsMarket[] = []) {}

  async fetch(signal: AbortSignal): Promise<RawHeadline[]> {
    const { text: body } = await this.client.get(this.sourceId, this.url, { headers: { accept: 'application/rss+xml, application/xml, text/xml' }, signal });
    const headlines = parseRss(this.name, body);
    await this.client.recordItems(this.sourceId, headlines.length);
    return headlines;
  }
}

/** RFC 822 dates, plus the bare "YYYY-MM-DD HH:MM:SS" some feeds use, which is UTC. */
function parseDate(value: string): number {
  const bare = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(value.trim());
  return bare ? Date.parse(`${bare[1] ?? ''}T${bare[2] ?? ''}Z`) : Date.parse(value);
}

export function parseRss(source: string, xml: string): RawHeadline[] {
  const doc: unknown = parser.parse(xml);
  const channel = (doc as { rss?: { channel?: { item?: unknown } | '' } }).rss?.channel;
  if (channel === undefined) throw new Error(`${source}: not an RSS document (the feed changed shape)`);
  const raw = channel === '' ? undefined : channel.item;
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const headlines = items.flatMap((item: Record<string, unknown>) => {
    const title = stripTags(text(item.title));
    const url = text(item.link).trim();
    const published = parseDate(text(item.pubDate));
    if (!title || !url || Number.isNaN(published)) return [];
    const summary = stripTags(text(item.description));
    return [{ source, title, url, summary: summary || null, publishedAt: published }];
  });
  if (items.length > 0 && headlines.length === 0) throw new Error(`${source}: ${String(items.length)} items but none readable (the feed changed shape)`);
  return headlines;
}

