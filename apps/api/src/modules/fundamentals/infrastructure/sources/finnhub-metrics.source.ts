import { z } from 'zod';
import type { SourceClient, SourceDescriptor } from '../../../../shared/sources';
import type { OverviewSource, UsFundamentals } from '../../application/us-fundamentals';

export const FINNHUB_METRICS: SourceDescriptor = {
  id: 'finnhub-metrics', owner: 'fundamentals', kind: 'company fundamentals', markets: ['us'], envKeys: ['FINNHUB_API_KEY'],
  rateLimit: { requests: 60, windowSec: 60 }, schedule: 'on demand',
  terms: 'Finnhub /stock/profile2 and /stock/metric with our own free key: name, sector, valuation, profitability, growth and 52-week range of a US-listed company, on demand.',
  docs: 'https://finnhub.io/docs/api/company-basic-financials',
};

const Profile = z.looseObject({ name: z.string().optional(), finnhubIndustry: z.string().optional(), currency: z.string().optional(), marketCapitalization: z.number().optional() });
const Metrics = z.looseObject({ metric: z.record(z.string(), z.unknown()).optional() });
const pick = (m: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const k of keys) { const v = m[k]; if (typeof v === 'number' && Number.isFinite(v)) return v; }
  return null;
};
const pct = (v: number | null): number | null => (v === null ? null : v / 100);

/** Turns Finnhub profile and metrics into our figures (Finnhub gives 25 for 25% and market cap in millions); null when it knows no such company. */
export function fromFinnhub(profile: unknown, metrics: unknown): Omit<UsFundamentals, 'symbol' | 'fetchedAt'> | null {
  const p = Profile.parse(profile); const m = Metrics.parse(metrics).metric ?? {};
  if (!p.name && Object.keys(m).length === 0) return null;
  const cap = p.marketCapitalization ?? pick(m, 'marketCapitalization');
  return {
    name: p.name ?? '', sector: p.finnhubIndustry ?? null, industry: p.finnhubIndustry ?? null, currency: p.currency ?? 'USD',
    marketCap: cap === null ? null : cap * 1e6, pe: pick(m, 'peTTM', 'peBasicExclExtraTTM', 'peAnnual'), forwardPe: pick(m, 'forwardPE'), peg: pick(m, 'pegTTM'),
    priceToBook: pick(m, 'pbQuarterly', 'pbAnnual'), eps: pick(m, 'epsTTM', 'epsBasicExclExtraItemsTTM'), dividendYield: pct(pick(m, 'currentDividendYieldTTM', 'dividendYieldIndicatedAnnual')),
    roe: pct(pick(m, 'roeTTM', 'roeRfy')), profitMargin: pct(pick(m, 'netProfitMarginTTM', 'netProfitMarginAnnual')), revenueGrowthYoY: pct(pick(m, 'revenueGrowthTTMYoy', 'revenueGrowthQuarterlyYoy')),
    earningsGrowthYoY: pct(pick(m, 'epsGrowthTTMYoy', 'epsGrowthQuarterlyYoy')), beta: pick(m, 'beta'), high52: pick(m, '52WeekHigh'), low52: pick(m, '52WeekLow'),
    analystTarget: null, latestQuarter: null, source: 'Finnhub',
  };
}

export class FinnhubMetricsSource implements OverviewSource {
  constructor(private readonly client: SourceClient, private readonly key: string | undefined) {}

  async fetch(ticker: string, signal: AbortSignal): Promise<Omit<UsFundamentals, 'symbol' | 'fetchedAt'> | null> {
    const key = this.key?.trim();
    if (!key) throw new Error('FINNHUB_API_KEY is not set');
    const get = async (path: string): Promise<unknown> =>
      JSON.parse((await this.client.get(FINNHUB_METRICS.id, `https://finnhub.io/api/v1${path}&token=${encodeURIComponent(key)}`, { signal, timeoutMs: 15_000 })).text);
    const [profile, metrics] = await Promise.all([get(`/stock/profile2?symbol=${encodeURIComponent(ticker)}`), get(`/stock/metric?symbol=${encodeURIComponent(ticker)}&metric=all`)]);
    const parsed = fromFinnhub(profile, metrics);
    if (parsed) await this.client.recordItems(FINNHUB_METRICS.id, 1);
    return parsed;
  }
}
