import { describe, expect, it } from 'vitest';
import { UsFundamentalsService } from '../../application/us-fundamentals';
import { fromFinnhub } from './finnhub-metrics.source';

const profile = { name: 'Apple Inc', finnhubIndustry: 'Technology', currency: 'USD', marketCapitalization: 3_400_000 };
const metrics = { metric: { peTTM: 33.1, pbQuarterly: 48.2, epsTTM: 6.42, currentDividendYieldTTM: 0.44, roeTTM: 157, netProfitMarginTTM: 24, revenueGrowthTTMYoy: 6.1, beta: 1.24, '52WeekHigh': 260.1, '52WeekLow': 169.2 } };

describe('fromFinnhub', () => {
  it('reads percentages as fractions and market cap from millions', () => {
    expect(fromFinnhub(profile, metrics)).toMatchObject({ name: 'Apple Inc', sector: 'Technology', marketCap: 3.4e12, pe: 33.1, dividendYield: 0.0044, roe: 1.57, profitMargin: 0.24, high52: 260.1, source: 'Finnhub' });
  });
  it('is null for a ticker Finnhub does not know', () => {
    expect(fromFinnhub({}, { metric: {} })).toBeNull();
  });
});

describe('UsFundamentalsService', () => {
  it('fetches once and answers from the cache after that', async () => {
    const store = new Map<string, string>();
    let calls = 0;
    const service = new UsFundamentalsService({ fetch: () => { calls++; return Promise.resolve(fromFinnhub(profile, metrics)); } },
      { get: k => Promise.resolve(store.get(k) ?? null), set: (k, v) => { store.set(k, v); return Promise.resolve(); } }, () => Date.parse('2026-11-14T00:00:00Z'));
    const signal = new AbortController().signal;
    expect(await service.get('NASDAQ:AAPL', signal)).toMatchObject({ symbol: 'NASDAQ:AAPL', pe: 33.1, fetchedAt: '2026-11-14T00:00:00.000Z' });
    await service.get('NASDAQ:AAPL', signal);
    expect(calls).toBe(1);
  });
  it('says why a fetch failed', async () => {
    const service = new UsFundamentalsService({ fetch: () => Promise.reject(new Error('FINNHUB_API_KEY is not set')) }, { get: () => Promise.resolve(null), set: () => Promise.resolve() });
    await expect(service.get('NASDAQ:AAPL', new AbortController().signal)).rejects.toMatchObject({ code: 'UNAVAILABLE', message: 'US fundamentals for NASDAQ:AAPL: FINNHUB_API_KEY is not set' });
  });
});
