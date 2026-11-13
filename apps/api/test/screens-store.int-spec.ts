import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ScreenSpec } from '@aitrader/contracts';
import * as schema from '../src/shared/database/schema';
import { DrizzleScreenStore } from '../src/modules/screener/infrastructure/drizzle-screen.store';
import { startPostgres } from './support/containers';

const spec: ScreenSpec = { universe: 'nifty50', interval: '1D', preset: 'rsi-oversold', indicators: [], fundamentals: [{ field: 'pe', op: 'lt', value: 25 }], limit: 50 };

describe('saved screens store (migration 0034)', () => {
  let container: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  let store: DrizzleScreenStore;
  const alice = randomUUID();
  const bob = randomUUID();
  beforeAll(async () => {
    container = await startPostgres();
    pool = new Pool({ connectionString: container.url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    for (const [id, name] of [[alice, 'alice'], [bob, 'bob']] as const) await pool.query("INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, 'x', 'user')", [id, name]);
    store = new DrizzleScreenStore(db);
  });
  afterAll(async () => { await pool.end(); await container.stop(); });

  it('keeps a screen per user: other users cannot read, change or delete it, and the spec round-trips', async () => {
    const id = randomUUID();
    const at = '2026-11-12T04:00:00.000Z';
    await store.insert({ id, userId: alice, name: 'Cheap oversold', spec, createdAt: at, updatedAt: at });
    expect(await store.get(bob, id)).toBeNull();
    expect(await store.get(alice, id)).toMatchObject({ name: 'Cheap oversold', spec });
    expect(await store.update(bob, id, { name: 'x', updatedAt: at })).toBe(false);
    expect(await store.update(alice, id, { name: 'renamed', updatedAt: '2026-11-12T05:00:00.000Z' })).toBe(true);
    expect((await store.list(alice)).map(s => s.name)).toEqual(['renamed']);
    expect(await store.list(bob)).toEqual([]);
    expect(await store.count(alice)).toBe(1);
    expect(await store.remove(bob, id)).toBe(false);
    expect(await store.remove(alice, id)).toBe(true);
    expect(await store.count(alice)).toBe(0);
  });
});
