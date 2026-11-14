import type { SourceClient, SourceDescriptor } from '../../../../shared/sources';
import type { OverviewSource, UsFundamentals } from '../../application/us-fundamentals';

export const ALPHAVANTAGE_OVERVIEW: SourceDescriptor = {
  id: 'alphavantage-overview', owner: 'fundamentals', kind: 'company fundamentals', markets: ['us'], envKeys: ['ALPHAVANTAGE_API_KEY'],
  // The free key allows 25 requests a day, shared with alphavantage-news (12 a day); each company is cached for three days.
  rateLimit: { requests: 12, windowSec: 86_400 }, schedule: 'on demand',
  terms: 'Alpha Vantage OVERVIEW with our own key on the free plan: valuation, profitability, growth and 52-week range of a US-listed company, on demand.',
  docs: 'https://www.alphavantage.co/documentation/#company-overview',
};

const num = (value: unknown): number | null => {
  if (typeof value !== 'string' || value === '' || value === 'None' || value === '-') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' && value !== 'None' ? value : null);

/** Parses OVERVIEW; null for an unknown ticker (the vendor answers `{}`); an in-band note (throttling, bad key) is an error. */
export function parseOverview(payload: unknown): Omit<UsFundamentals, 'symbol' | 'fetchedAt'> | null {
  if (typeof payload !== 'object' || payload === null) throw new Error('Alpha Vantage OVERVIEW: not an object');
  const o = payload as Record<string, unknown>;
  const note = text(o.Note) ?? text(o.Information) ?? text(o['Error Message']);
  if (note) throw new Error(`Alpha Vantage OVERVIEW: ${note.slice(0, 160)}`);
  if (!text(o.Symbol)) return null;
  return {
    name: text(o.Name) ?? String(o.Symbol), sector: text(o.Sector), industry: text(o.Industry), currency: text(o.Currency) ?? 'USD',
    marketCap: num(o.MarketCapitalization), pe: num(o.PERatio), forwardPe: num(o.ForwardPE), peg: num(o.PEGRatio), priceToBook: num(o.PriceToBookRatio), eps: num(o.EPS),
    dividendYield: num(o.DividendYield), roe: num(o.ReturnOnEquityTTM), profitMargin: num(o.ProfitMargin), revenueGrowthYoY: num(o.QuarterlyRevenueGrowthYOY),
    earningsGrowthYoY: num(o.QuarterlyEarningsGrowthYOY), beta: num(o.Beta), high52: num(o['52WeekHigh']), low52: num(o['52WeekLow']),
    analystTarget: num(o.AnalystTargetPrice), latestQuarter: text(o.LatestQuarter), source: 'Alpha Vantage',
  };
}

export class AlphaVantageOverviewSource implements OverviewSource {
  constructor(private readonly client: SourceClient, private readonly key: string | undefined) {}

  async fetch(ticker: string, signal: AbortSignal): Promise<Omit<UsFundamentals, 'symbol' | 'fetchedAt'> | null> {
    if (!this.key?.trim()) throw new Error('ALPHAVANTAGE_API_KEY is not set');
    const { text: body } = await this.client.get(ALPHAVANTAGE_OVERVIEW.id,
      `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(this.key.trim())}`, { signal, timeoutMs: 15_000 });
    const parsed = parseOverview(JSON.parse(body));
    if (parsed) await this.client.recordItems(ALPHAVANTAGE_OVERVIEW.id, 1);
    return parsed;
  }
}
