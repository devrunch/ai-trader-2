import type { Fundamentals } from '@aitrader/contracts';
import { describe, expect, it, vi } from 'vitest';
import { FundamentalsNotFoundError, FundamentalsParseError } from '../domain/errors';
import { visibleAt } from '../domain/visibility';
import { FundamentalsService } from './fundamentals';
import type { FundamentalsFigures, FundamentalsSource } from './ports/fundamentals-source';
import type { FundamentalsStore } from './ports/fundamentals-store';

const NOW = Date.parse('2026-03-10T10:00:00Z');
const figures: FundamentalsFigures = { name: 'Infosys', reportDate: '2025-12-31', quarterly: [], annual: [], shareholding: { period: null, promoter: null, fii: null, dii: null, public: null },
  ratios: { marketCap: 1, pe: 20, bookValue: 1, roe: 1, roce: 1, dividendYield: 1, debtToEquity: 0, salesGrowth3y: null, salesGrowth5y: null, profitGrowth3y: null, profitGrowth5y: null, promoterHolding: null, fiiHolding: null, diiHolding: null } };
const record = (fetchedAt: string, reportDate: string | null = '2025-12-31', symbol = 'NSE:INFY'): Fundamentals => ({ ...figures, symbol, consolidated: false, source: 'screener-in', fetchedAt, reportDate });

function memoryStore(rows: Fundamentals[] = []): FundamentalsStore & { rows: Fundamentals[] } {
  const visible = (r: Fundamentals, asOf?: number) => asOf === undefined || visibleAt(r, asOf);
  const newest = (xs: Fundamentals[]) => xs.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0] ?? null;
  return { rows,
    latest: (s, asOf) => Promise.resolve(newest(rows.filter(r => r.symbol === s && visible(r, asOf)))),
    latestMany: (ss, asOf) => Promise.resolve(ss.flatMap(s => newest(rows.filter(r => r.symbol === s && visible(r, asOf))) ?? [])),
    save: r => { rows.push(r); return Promise.resolve(); },
    fetchedSince: since => Promise.resolve(new Set(rows.filter(r => Date.parse(r.fetchedAt) >= since).map(r => r.symbol))) };
}
const make = (store: FundamentalsStore, fetch: FundamentalsSource['fetch']) => {
  const source: FundamentalsSource = { id: 'screener-in', fetch };
  return new FundamentalsService(source, store, { now: () => NOW, warn: vi.fn() });
};

describe('FundamentalsService.get', () => {
  it('serves a record under 24 hours old without fetching', async () => {
    const fetch = vi.fn<FundamentalsSource['fetch']>();
    const got = await make(memoryStore([record('2026-03-09T12:00:00.000Z')]), fetch).get('NSE:INFY');
    expect(got).toMatchObject({ symbol: 'NSE:INFY', stale: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches on a miss, stores the record with source and fetch time', async () => {
    const store = memoryStore();
    const fetch = vi.fn<FundamentalsSource['fetch']>().mockResolvedValue(figures);
    const got = await make(store, fetch).get('NSE:INFY');
    expect(fetch).toHaveBeenCalledWith('INFY', false);
    expect(got).toMatchObject({ source: 'screener-in', fetchedAt: '2026-03-10T10:00:00.000Z', consolidated: false, stale: false });
    expect(store.rows).toHaveLength(1);
  });

  it('falls back to the consolidated page when the standalone one has none', async () => {
    const fetch = vi.fn<FundamentalsSource['fetch']>((_t, consolidated) => consolidated ? Promise.resolve(figures) : Promise.reject(new FundamentalsNotFoundError('x')));
    expect(await make(memoryStore(), fetch).get('NSE:INFY')).toMatchObject({ consolidated: true });
    expect(fetch.mock.calls.map(c => c[1])).toEqual([false, true]);
  });

  it('throws NOT_FOUND when neither page exists', async () => {
    const fetch = vi.fn<FundamentalsSource['fetch']>().mockRejectedValue(new FundamentalsNotFoundError('x'));
    await expect(make(memoryStore(), fetch).get('NSE:NOPE')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('flags the cached record stale when an expired entry cannot be refreshed', async () => {
    const fetch = vi.fn<FundamentalsSource['fetch']>().mockRejectedValue(new FundamentalsParseError('markup'));
    const got = await make(memoryStore([record('2026-03-08T10:00:00.000Z')]), fetch).get('NSE:INFY');
    expect(got).toMatchObject({ fetchedAt: '2026-03-08T10:00:00.000Z', stale: true });
  });

  it('reports UNAVAILABLE when the refresh fails and nothing is cached', async () => {
    const fetch = vi.fn<FundamentalsSource['fetch']>().mockRejectedValue(new FundamentalsParseError('markup'));
    await expect(make(memoryStore(), fetch).get('NSE:INFY')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('rejects a non-NSE symbol', async () => {
    await expect(make(memoryStore(), vi.fn()).get('FX:EURUSD')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('shares one fetch between concurrent requests for the same symbol', async () => {
    const fetch = vi.fn<FundamentalsSource['fetch']>().mockResolvedValue(figures);
    const svc = make(memoryStore(), fetch);
    await Promise.all([svc.get('NSE:INFY'), svc.get('NSE:INFY')]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('FundamentalsService asOf (leak test)', () => {
  const rows = [record('2026-01-20T00:00:00.000Z', '2025-12-31'), record('2026-02-20T00:00:00.000Z', '2025-12-31'), record('2026-03-01T00:00:00.000Z', '2026-03-31')];

  it('returns the newest record fetched and published by asOf, never a later one', async () => {
    const svc = make(memoryStore([...rows]), vi.fn());
    expect((await svc.get('NSE:INFY', { asOf: Date.parse('2026-02-25T00:00:00Z') }))?.fetchedAt).toBe('2026-02-20T00:00:00.000Z');
    expect((await svc.get('NSE:INFY', { asOf: Date.parse('2026-03-05T00:00:00Z') }))?.fetchedAt).toBe('2026-02-20T00:00:00.000Z');
    expect(await svc.get('NSE:INFY', { asOf: Date.parse('2026-01-10T00:00:00Z') })).toBeNull();
  });

  it('never fetches for a past view', async () => {
    const fetch = vi.fn<FundamentalsSource['fetch']>();
    expect(await make(memoryStore(), fetch).get('NSE:INFY', { asOf: Date.parse('2026-01-10T00:00:00Z') })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('FundamentalsService.getMany', () => {
  it('reads only the cache and lists the symbols that are missing', async () => {
    const fetch = vi.fn<FundamentalsSource['fetch']>();
    const out = await make(memoryStore([record('2026-03-09T12:00:00.000Z')]), fetch).getMany(['NSE:INFY', 'NSE:TCS']);
    expect(out.found.map(f => f.symbol)).toEqual(['NSE:INFY']);
    expect(out.missing).toEqual(['NSE:TCS']);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('FundamentalsService.refreshAll', () => {
  it('skips symbols fetched in the last 20 hours, continues past a failure and counts it', async () => {
    const store = memoryStore([record('2026-03-10T00:00:00.000Z', '2025-12-31', 'NSE:TCS')]);
    const fetch = vi.fn<FundamentalsSource['fetch']>(t => t === 'BAD' ? Promise.reject(new FundamentalsNotFoundError('x')) : Promise.resolve(figures));
    const out = await make(store, fetch).refreshAll(['NSE:TCS', 'NSE:BAD', 'NSE:INFY'], new AbortController().signal);
    expect(out).toEqual({ refreshed: 1, skipped: 1, failed: ['NSE:BAD'] });
  });

  it('stops when aborted', async () => {
    const ctl = new AbortController();
    ctl.abort();
    const fetch = vi.fn<FundamentalsSource['fetch']>();
    expect(await make(memoryStore(), fetch).refreshAll(['NSE:INFY'], ctl.signal)).toEqual({ refreshed: 0, skipped: 0, failed: [] });
    expect(fetch).not.toHaveBeenCalled();
  });
});
