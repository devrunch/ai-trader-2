import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import type { Fundamentals } from '@aitrader/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/shared/database/schema';
import { DrizzleFundamentalsStore } from '../src/modules/fundamentals/infrastructure/drizzle-fundamentals.store';
import { startPostgres } from './support/containers';

const record = (symbol: string, fetchedAt: string, reportDate: string | null, pe = 20): Fundamentals => ({ symbol, name: null, consolidated: false, source: 'screener-in', fetchedAt, reportDate,
  ratios: { marketCap: 1, pe, bookValue: 1, roe: 1, roce: 1, dividendYield: 1, debtToEquity: 0, salesGrowth3y: null, salesGrowth5y: null, profitGrowth3y: null, profitGrowth5y: null, promoterHolding: 50, fiiHolding: null, diiHolding: null },
  quarterly: [], annual: [], shareholding: { period: null, promoter: 50, fii: null, dii: null, public: null } });

describe('fundamentals store', () => {
  let container: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  let store: DrizzleFundamentalsStore;
  beforeAll(async () => {
    container = await startPostgres();
    pool = new Pool({ connectionString: container.url });
    await migrate(drizzle(pool, { schema }), { migrationsFolder: './drizzle' });
    store = new DrizzleFundamentalsStore(drizzle(pool, { schema }));
  });
  afterAll(async () => { await pool.end(); await container.stop(); });

  it('keeps one row per fetch and returns the newest; saving the same fetch twice is a no-op', async () => {
    await store.save(record('NSE:INFY', '2026-01-20T00:00:00.000Z', '2025-09-30', 18));
    await store.save(record('NSE:INFY', '2026-02-20T00:00:00.000Z', '2025-12-31', 22));
    await store.save(record('NSE:INFY', '2026-02-20T00:00:00.000Z', '2025-12-31', 99));
    expect((await store.latest('NSE:INFY'))?.ratios.pe).toBe(22);
    expect(await store.latest('NSE:NONE')).toBeNull();
  });

  it('asOf never returns a record fetched after it or with results not yet published', async () => {
    await store.save(record('NSE:TCS', '2026-01-20T00:00:00.000Z', '2025-12-31', 1));
    await store.save(record('NSE:TCS', '2026-03-01T00:00:00.000Z', '2026-03-31', 2));
    await store.save(record('NSE:TCS', '2026-04-10T00:00:00.000Z', '2026-03-31', 3));
    const at = (iso: string) => store.latest('NSE:TCS', Date.parse(iso)).then(r => r?.ratios.pe ?? null);
    expect(await at('2026-01-10T00:00:00Z')).toBeNull();
    expect(await at('2026-02-01T00:00:00Z')).toBe(1);
    expect(await at('2026-03-05T00:00:00Z')).toBe(1);
    expect(await at('2026-04-15T00:00:00Z')).toBe(3);
    expect(await at('2026-04-10T00:00:00Z')).toBe(3);
    expect(await at('2026-04-09T23:59:59Z')).toBe(2);
  });

  it('reads the newest record of several symbols from the cache and lists what was fetched since a time', async () => {
    const many = await store.latestMany(['NSE:INFY', 'NSE:TCS', 'NSE:NONE']);
    expect(many.map(r => [r.symbol, r.ratios.pe]).sort()).toEqual([['NSE:INFY', 22], ['NSE:TCS', 3]]);
    expect(await store.latestMany([])).toEqual([]);
    expect([...await store.fetchedSince(Date.parse('2026-04-01T00:00:00Z'))]).toEqual(['NSE:TCS']);
  });
});
