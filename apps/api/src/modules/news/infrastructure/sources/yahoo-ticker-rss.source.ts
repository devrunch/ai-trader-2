import type { SourceClient, SourceDescriptor } from '../../../../shared/sources';
import type { NewsSource, RawHeadline } from '../../application/news';
import { parseRss } from './rss.source';

export const YAHOO_TICKER_DESCRIPTOR: SourceDescriptor = {
  id: 'yahoo-ticker-rss', owner: 'news', kind: 'headlines', markets: ['us'], envKeys: [],
  rateLimit: { requests: 40, windowSec: 300 }, schedule: '*/5 * * * *',
  terms: "Yahoo Finance's public per-ticker RSS headline feed (feeds.finance.yahoo.com/rss/2.0/headline); headline, link and summary only, a few tickers per run in rotation, linked back to the publisher.",
  docs: 'https://finance.yahoo.com/rss/',
};

const PER_RUN = 6;
/** Yahoo's ticker for a canonical US id (`NASDAQ:AAPL` -> `AAPL`); anything else is not served by this feed. */
const yahooTicker = (id: string): string | null => /^(?:NASDAQ|NYSE):([A-Z]{1,5})$/.exec(id)?.[1] ?? null;

/** Per-ticker headlines for the US instruments people watch (and the ones we tag). A few tickers per run, rotating, so the request budget holds. */
export class YahooTickerRssSource implements NewsSource {
  readonly name = 'Yahoo Finance';
  readonly markets = ['us'] as const;
  private cursor = 0;
  constructor(private readonly symbols: () => Promise<string[]>, private readonly client: SourceClient) {}

  async fetch(signal: AbortSignal): Promise<RawHeadline[]> {
    const tickers = [...new Set((await this.symbols()).filter(s => yahooTicker(s) !== null))].sort();
    if (tickers.length === 0) return [];
    const start = this.cursor % tickers.length;
    this.cursor += PER_RUN;
    const batch = Array.from({ length: Math.min(PER_RUN, tickers.length) }, (_, i) => tickers[(start + i) % tickers.length] ?? '');
    const out: RawHeadline[] = [];
    let failed = 0;
    let lastError: unknown;
    for (const id of batch) {
      try {
        const { text } = await this.client.get(YAHOO_TICKER_DESCRIPTOR.id, `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${yahooTicker(id) ?? ''}&region=US&lang=en-US`, { signal });
        out.push(...parseRss(this.name, text).map(h => ({ ...h, symbols: [id] })));
      } catch (error) { failed++; lastError = error; }
    }
    // One unknown ticker must not hide the others; only a run where every ticker failed is a failure.
    if (failed === batch.length) throw lastError instanceof Error ? lastError : new Error('yahoo ticker feeds failed');
    await this.client.recordItems(YAHOO_TICKER_DESCRIPTOR.id, out.length);
    return out;
  }
}
