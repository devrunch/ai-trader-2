import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/shared/database/schema';
import { DrizzleNewsStore } from '../src/modules/news/infrastructure/drizzle-news.store';
import { startPostgres } from './support/containers';

describe('news store', () => {
  let container: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  let store: DrizzleNewsStore;
  beforeAll(async () => {
    container = await startPostgres();
    pool = new Pool({ connectionString: container.url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    store = new DrizzleNewsStore(db);
  });
  afterAll(async () => { await pool.end(); await container.stop(); });

  const item = (id: string, at: string, symbols: string[]) => ({ id, source: 'ET', title: `Headline ${id}`, url: `https://et.test/${id}`, summary: null, publishedAt: at, symbols, impact: 'low' as const, moves: [] as string[], direction: null, markets: [] as Array<'india' | 'us'>, sentiment: null, crowd: false });

  it('stores each headline once, lists newest first, filters by instrument and prunes old ones', async () => {
    expect(await store.insert([item('a', '2026-11-11T03:00:00.000Z', ['NSE:NIFTY']), item('b', '2026-11-11T04:00:00.000Z', ['NSE:RELIANCE', 'NSE:NIFTY'])])).toBe(2);
    expect(await store.insert([item('a', '2026-11-11T03:00:00.000Z', ['NSE:NIFTY']), item('c', '2026-10-01T00:00:00.000Z', [])])).toBe(1);
    const since = Date.parse('2026-11-10T00:00:00Z');
    expect((await store.list({ since, limit: 10 })).map(i => i.id)).toEqual(['b', 'a']);
    expect((await store.list({ symbol: 'NSE:RELIANCE', since, limit: 10 })).map(i => i.id)).toEqual(['b']);
    expect(await store.prune(Date.parse('2026-11-01T00:00:00Z'), 1000)).toBe(1);
    expect((await store.list({ since: 0, limit: 10 })).map(i => i.id)).toEqual(['b', 'a']);
  });

  it('round-trips impact, moves and direction and filters by minimum impact', async () => {
    const hi = { ...item('hi', '2026-11-11T05:00:00.000Z', []), impact: 'high' as const, moves: ['NSE:NIFTY', 'FX:USDINR'], direction: 'up' as const };
    const mid = { ...item('mid', '2026-11-11T05:30:00.000Z', []), impact: 'medium' as const, direction: 'unclear' as const };
    await store.insert([hi, mid, item('lo', '2026-11-11T06:00:00.000Z', [])]);
    const since = Date.parse('2026-11-11T05:00:00Z');
    expect(await store.list({ since, limit: 10, minImpact: 'high' })).toEqual([hi]);
    expect((await store.list({ since, limit: 10, minImpact: 'medium' })).map(i => i.id)).toEqual(['mid', 'hi']);
    expect((await store.list({ since, limit: 10 })).map(i => i.id)).toEqual(['lo', 'mid', 'hi']);
  });

  it('keeps 90 days and the newest rows under the cap', async () => {
    await store.insert(['p1', 'p2', 'p3'].map((id, i) => item(id, `2026-09-0${String(i + 1)}T00:00:00.000Z`, [])));
    expect(await store.prune(Date.parse('2026-08-01T00:00:00Z'), 1000)).toBe(0);
    const total = (await store.list({ since: 0, limit: 100 })).length;
    expect(await store.prune(Date.parse('2026-08-01T00:00:00Z'), total - 2)).toBe(2);
    expect((await store.list({ since: 0, limit: 100 })).some(i => i.id === 'p1')).toBe(false);
  });

  it('stores markets, sentiment and crowd, scores the unscored once, and never returns anything after asOf', async () => {
    await store.insert([{ ...item('s1', '2026-11-12T01:00:00.000Z', ['NSE:INFY']), markets: ['india'] }, { ...item('s2', '2026-11-12T03:00:00.000Z', ['NSE:INFY']), markets: ['india'] },
      { ...item('s3', '2026-11-12T02:00:00.000Z', []), markets: ['us'], crowd: true }]);
    expect((await store.unscored(10)).map(i => i.id)).toEqual(expect.arrayContaining(['s1', 's2', 's3']));
    await store.setSentiment(new Map([['s1', { label: 'bullish' as const, score: 0.5, by: 'llm' as const }], ['s2', { label: 'bearish' as const, score: -0.25, by: 'rules' as const }]]));
    await store.setSentiment(new Map([['s1', { label: 'bearish' as const, score: -1, by: 'rules' as const }]]));
    expect((await store.unscored(10)).map(i => i.id)).toContain('s3');
    expect((await store.unscored(10)).map(i => i.id)).not.toContain('s1');
    const since = Date.parse('2026-11-12T00:00:00Z');
    const [s1] = await store.list({ since, limit: 10, symbol: 'NSE:INFY', until: Date.parse('2026-11-12T01:30:00Z') });
    expect(s1).toMatchObject({ id: 's1', sentiment: { label: 'bullish', score: 0.5, by: 'llm' }, markets: ['india'], crowd: false });
    expect((await store.list({ since, limit: 10, market: 'us', crowd: true })).map(i => i.id)).toEqual(['s3']);
    expect((await store.list({ since, limit: 10, crowd: false, until: Date.parse('2026-11-12T01:30:00Z') })).map(i => i.id)).toEqual(['s1']);
    const rows = await store.sentimentRows({ symbol: 'NSE:INFY' }, since, Date.parse('2026-11-12T02:00:00Z'));
    expect(rows.map(r => r.sentiment?.score)).toEqual([0.5]);
    expect((await store.sentimentRows({ market: 'us' }, since, Date.parse('2026-11-12T05:00:00Z')))).toEqual([]);
  });
});
