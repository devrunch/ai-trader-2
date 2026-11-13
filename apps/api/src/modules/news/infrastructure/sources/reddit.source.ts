import { z } from 'zod';
import type { NewsMarket } from '@aitrader/contracts';
import type { SourceClient, SourceDescriptor } from '../../../../shared/sources';
import { MinInterval } from './min-interval';
import type { NewsSource, RawHeadline } from '../../application/news';

export const SUBREDDITS: ReadonlyArray<{ name: string; market: NewsMarket }> = [
  { name: 'IndianStockMarket', market: 'india' }, { name: 'forex', market: 'forex' }, { name: 'wallstreetbets', market: 'us' }, { name: 'CryptoCurrency', market: 'crypto' },
];

export const REDDIT_DESCRIPTOR: SourceDescriptor = {
  id: 'reddit', owner: 'news', kind: 'crowd', markets: SUBREDDITS.map(s => s.market), envKeys: [],
  rateLimit: { requests: 20, windowSec: 600 }, schedule: '*/10 * * * *',
  terms: 'Reddit public JSON listings (reddit.com/r/<sub>/hot.json), no login, our own User-Agent, four requests every ten minutes; post title and link only, shown labelled as crowd chatter, not news.',
  docs: 'https://www.reddit.com/dev/api/',
};

const Listing = z.object({ data: z.object({ children: z.array(z.object({ data: z.object({ title: z.string(), permalink: z.string(), selftext: z.string().optional(),
  created_utc: z.number(), score: z.number(), stickied: z.boolean().optional() }) })) }) });
/** Below this a post is noise, and every kept post spends sentiment budget. */
const MIN_SCORE = 15;
const EVERY_MS = 10 * 60_000;

/** One subreddit's hot posts as crowd chatter. Posts are labelled `crowd` so nothing treats them as journalism (FR-HM-3). */
export class RedditSource implements NewsSource {
  readonly name: string;
  readonly markets: readonly NewsMarket[];
  private readonly due: MinInterval;
  constructor(private readonly sub: string, market: NewsMarket, private readonly client: SourceClient, clock: () => number = Date.now) {
    this.due = new MinInterval(EVERY_MS, clock);
    this.name = `r/${sub}`;
    this.markets = [market];
  }

  async fetch(signal: AbortSignal): Promise<RawHeadline[]> {
    if (!this.due.take()) return [];
    const { text } = await this.client.get(REDDIT_DESCRIPTOR.id, `https://www.reddit.com/r/${this.sub}/hot.json?limit=30&raw_json=1`, { signal });
    const posts = Listing.parse(JSON.parse(text)).data.children;
    const headlines = posts.flatMap(({ data: p }) => (p.stickied || p.score < MIN_SCORE ? []
      : [{ source: this.name, title: p.title, url: `https://www.reddit.com${p.permalink}`, summary: p.selftext?.trim().slice(0, 500) || null, publishedAt: p.created_utc * 1000, crowd: true }]));
    await this.client.recordItems(REDDIT_DESCRIPTOR.id, headlines.length);
    return headlines;
  }
}
