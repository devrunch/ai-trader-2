import type { SourceDescriptor } from '../../../../shared/sources';
import type { SourceClient } from '../../../../shared/sources';
import { SourceUnavailableError } from '../../../../shared/sources';
import type { SourceFigures, FundamentalsSource } from '../../application/ports/fundamentals-source';
import { FundamentalsNotFoundError, FundamentalsParseError } from '../../domain/errors';
import { parseScreenerPage } from './screener-in.parse';

export const SCREENER_IN: SourceDescriptor = {
  id: 'screener-in', owner: 'fundamentals', kind: 'fundamentals', markets: ['India'], envKeys: [],
  rateLimit: { requests: 1, windowSec: 3 }, schedule: 'on-demand + nightly',
  terms: 'company pages only, robots.txt, <= 1 request / 3 s', docs: 'https://www.screener.in/robots.txt',
};

// robots.txt disallows ?page, ?sort, ?q and others: the only shapes ever requested are these two paths, with no query string.
const ALLOWED_URL = /^https:\/\/www\.screener\.in\/company\/[A-Z0-9&-]{1,20}\/(consolidated\/)?$/;
const TICKER = /^[A-Z0-9&-]{1,20}$/;
const NOT_FOUND = /answered HTTP 404/;
const MAX_WAIT_MS = 30_000;

export function companyUrl(ticker: string, consolidated: boolean): string {
  const url = `https://www.screener.in/company/${ticker}/${consolidated ? 'consolidated/' : ''}`;
  if (!TICKER.test(ticker) || !ALLOWED_URL.test(url)) throw new Error(`screener-in refuses to request "${ticker}": only /company/<SYMBOL>/ and /company/<SYMBOL>/consolidated/ are allowed`);
  return url;
}

/** Ratios, results, growth and shareholding from screener.in company pages (unauthenticated, one page per company). */
export class ScreenerInSource implements FundamentalsSource {
  readonly id = SCREENER_IN.id;

  constructor(private readonly client: Pick<SourceClient, 'get' | 'recordItems'>) {}

  async fetch(ticker: string, consolidated: boolean, signal?: AbortSignal): Promise<SourceFigures> {
    const url = companyUrl(ticker, consolidated);
    let body: string;
    try {
      body = (await this.client.get(this.id, url, { timeoutMs: 20_000, maxWaitMs: MAX_WAIT_MS, ...(signal ? { signal } : {}) })).text;
    } catch (error) {
      if (error instanceof SourceUnavailableError && NOT_FOUND.test(error.message)) throw new FundamentalsNotFoundError(`screener.in has no company ${ticker}`);
      throw error;
    }
    try {
      const { figures, ratiosFound } = parseScreenerPage(body);
      await this.client.recordItems(this.id, ratiosFound);
      return figures;
    } catch (error) {
      if (error instanceof FundamentalsParseError) await this.client.recordItems(this.id, 0);
      throw error;
    }
  }
}
