import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/shared/database/schema';
import { DrizzleAssistantPrefsStore } from '../src/modules/agent/infrastructure/drizzle-assistant-prefs.store';
import { startPostgres } from './support/containers';

describe('assistant settings store (migration 0043)', () => {
  let container: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  let store: DrizzleAssistantPrefsStore;
  const alice = randomUUID();
  beforeAll(async () => {
    container = await startPostgres();
    pool = new Pool({ connectionString: container.url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    await pool.query("INSERT INTO users (id, username, password_hash, role) VALUES ($1, 'alice', 'x', 'user')", [alice]);
    store = new DrizzleAssistantPrefsStore(db);
  });
  afterAll(async () => { await pool.end(); await container.stop(); });

  it('has nothing until the user saves, then keeps the latest setting', async () => {
    expect(await store.get(alice)).toBeNull();
    await store.set(alice, { mode: 'ask', maxRiskPct: 1, maxTradesPerDay: 5 });
    await store.set(alice, { mode: 'act', maxRiskPct: 0.7, maxTradesPerDay: 2 });
    expect(await store.get(alice)).toEqual({ mode: 'act', maxRiskPct: 0.7, maxTradesPerDay: 2 });
  });
});
