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

  const item = (id: string, at: string, symbols: string[]) => ({ id, source: 'ET', title: `Headline ${id}`, url: `https://et.test/${id}`, summary: null, publishedAt: at, symbols, impact: 'low' as const, moves: [] as string[], direction: null });

  it('stores each headline once, lists newest first, filters by instrument and prunes old ones', async () => {
    expect(await store.insert([item('a', '2026-11-11T03:00:00.000Z', ['NSE:NIFTY']), item('b', '2026-11-11T04:00:00.000Z', ['NSE:RELIANCE', 'NSE:NIFTY'])])).toBe(2);
    expect(await store.insert([item('a', '2026-11-11T03:00:00.000Z', ['NSE:NIFTY']), item('c', '2026-10-01T00:00:00.000Z', [])])).toBe(1);
    const since = Date.parse('2026-11-10T00:00:00Z');
    expect((await store.list({ since, limit: 10 })).map(i => i.id)).toEqual(['b', 'a']);
    expect((await store.list({ symbol: 'NSE:RELIANCE', since, limit: 10 })).map(i => i.id)).toEqual(['b']);
    expect(await store.prune(Date.parse('2026-11-01T00:00:00Z'))).toBe(1);
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
});
