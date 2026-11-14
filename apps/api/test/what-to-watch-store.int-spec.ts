import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WatchItem } from '@aitrader/contracts';
import * as schema from '../src/shared/database/schema';
import { DrizzleWhatToWatchStore } from '../src/modules/agent/infrastructure/drizzle-what-to-watch.store';
import { startPostgres } from './support/containers';

const item = (id: string, outcome: WatchItem['outcome']): WatchItem => ({ id, title: 'Reliance may follow crude higher', why: 'Crude is up after a stock draw.',
  symbols: ['NSE:RELIANCE'], direction: 'up', confidence: 0.6, horizon: 'today', follow: null, refPrices: { 'NSE:RELIANCE': 1340 }, outcome, movePct: null, resolvedAt: null, taskId: null });

describe('What to watch store (migration 0042)', () => {
  let container: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  let store: DrizzleWhatToWatchStore;
  const alice = randomUUID();
  const bob = randomUUID();
  beforeAll(async () => {
    container = await startPostgres();
    pool = new Pool({ connectionString: container.url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    for (const [id, name] of [[alice, 'alice'], [bob, 'bob']] as const) await pool.query("INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, 'x', 'user')", [id, name]);
    store = new DrizzleWhatToWatchStore(db);
  });
  afterAll(async () => { await pool.end(); await container.stop(); });

  it('keeps lists per user, newest first, and updates a list in place', async () => {
    const older = { id: randomUUID(), createdAt: Date.parse('2026-11-16T03:00:00Z'), items: [item('a', 'open')] };
    const newer = { id: randomUUID(), createdAt: Date.parse('2026-11-17T03:00:00Z'), items: [item('b', 'open')] };
    await store.save(alice, older);
    await store.save(alice, newer);
    expect((await store.latest(alice))?.id).toBe(newer.id);
    expect(await store.latest(bob)).toBeNull();
    expect((await store.recent(alice, 5)).map(l => l.id)).toEqual([newer.id, older.id]);
    await store.save(alice, { ...older, items: [item('a', 'right')] });
    expect((await store.recent(alice, 5)).find(l => l.id === older.id)?.items[0]?.outcome).toBe('right');
  });

  it('lists only lists that still have open items', async () => {
    const open = await store.open(10);
    expect(open.every(o => o.list.items.some(i => i.outcome === 'open'))).toBe(true);
    expect(open.map(o => o.userId)).toContain(alice);
  });
});
