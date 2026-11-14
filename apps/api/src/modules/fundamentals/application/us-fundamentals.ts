import { messageOf, UnavailableError } from '../../../shared/errors';

/** Key figures of a US-listed company. Ratios are plain numbers (0.25 = 25%); null when the vendor has none. */
export interface UsFundamentals {
  symbol: string; name: string; sector: string | null; industry: string | null; currency: string;
  marketCap: number | null; pe: number | null; forwardPe: number | null; peg: number | null; priceToBook: number | null; eps: number | null;
  dividendYield: number | null; roe: number | null; profitMargin: number | null; revenueGrowthYoY: number | null; earningsGrowthYoY: number | null;
  beta: number | null; high52: number | null; low52: number | null; analystTarget: number | null; latestQuarter: string | null;
  source: string; fetchedAt: string;
}
export interface OverviewSource { fetch(ticker: string, signal: AbortSignal): Promise<Omit<UsFundamentals, 'symbol' | 'fetchedAt'> | null> }
export interface TextCache { get(key: string): Promise<string | null>; set(key: string, value: string, ttlSec: number): Promise<void> }

/** Figures change with quarterly results: one fetch per company every three days. */
const TTL_SEC = 3 * 86_400;
const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'BATS']);

export const isUsListing = (symbol: string): boolean => US_EXCHANGES.has(symbol.slice(0, symbol.indexOf(':')));

/** Fundamentals of US-listed companies, cached. */
export class UsFundamentalsService {
  constructor(private readonly source: OverviewSource, private readonly cache: TextCache, private readonly now: () => number = Date.now) {}

  async get(symbol: string, signal: AbortSignal): Promise<UsFundamentals | null> {
    const key = `fundamentals:us:${symbol}`;
    const cached = await this.cache.get(key);
    if (cached) return JSON.parse(cached) as UsFundamentals;
    const fetched = await this.source.fetch(symbol.slice(symbol.indexOf(':') + 1), signal)
      .catch((error: unknown) => { throw new UnavailableError(`US fundamentals for ${symbol}: ${messageOf(error)}`.slice(0, 300)); });
    if (!fetched) return null;
    const record: UsFundamentals = { ...fetched, symbol, fetchedAt: new Date(this.now()).toISOString() };
    await this.cache.set(key, JSON.stringify(record), TTL_SEC);
    return record;
  }
}
