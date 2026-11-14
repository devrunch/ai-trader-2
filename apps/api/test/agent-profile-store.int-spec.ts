import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/shared/database/schema';
import { DrizzleProfileStore, DrizzleSignalStore } from '../src/modules/agent/infrastructure/drizzle-profile.store';
import { DrizzleTurnStore } from '../src/modules/agent/infrastructure/drizzle-chat.stores';
import { startPostgres } from './support/containers';

describe('assistant profile and signals store (migration 0039)', () => {
  let container: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  let profiles: DrizzleProfileStore;
  let signals: DrizzleSignalStore;
  let turns: DrizzleTurnStore;
  const alice = randomUUID();
  const bob = randomUUID();
  beforeAll(async () => {
    container = await startPostgres();
    pool = new Pool({ connectionString: container.url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    for (const [id, name] of [[alice, 'alice'], [bob, 'bob']] as const) await pool.query("INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, 'x', 'user')", [id, name]);
    profiles = new DrizzleProfileStore(db);
    signals = new DrizzleSignalStore(db);
    turns = new DrizzleTurnStore(db);
  });
  afterAll(async () => { await pool.end(); await container.stop(); });

  it('stores one profile per user, replacing it on write, and reads {} when none', async () => {
    expect(await profiles.get(alice)).toEqual({});
    await profiles.set(alice, { markets: ['NSE'], length: 'short' });
    await profiles.set(alice, { markets: ['NSE', 'MCX'], riskPerTradePct: 1 });
    expect(await profiles.get(alice)).toEqual({ markets: ['NSE', 'MCX'], riskPerTradePct: 1 });
    expect(await profiles.get(bob)).toEqual({});
  });

  it('records a signal once per event key and deletes by owner', async () => {
    expect(await signals.record(alice, randomUUID(), { eventKey: 'card:1:applied', kind: 'card-applied', topic: 'card:draw', tools: [] })).toBe(true);
    expect(await signals.record(alice, randomUUID(), { eventKey: 'card:1:applied', kind: 'card-applied', topic: 'card:draw', tools: [] })).toBe(false);
    expect(await signals.record(bob, randomUUID(), { eventKey: 'card:1:applied', kind: 'card-applied', topic: 'card:draw', tools: [] })).toBe(true);
    const [item] = await signals.list(alice);
    expect(item).toMatchObject({ kind: 'card-applied', topic: 'card:draw', tools: [] });
    expect(await signals.remove(bob, item?.id ?? '')).toBe(0);
    expect(await signals.remove(alice, item?.id ?? '')).toBe(1);
    expect(await signals.remove(bob, null)).toBe(1);
  });

  it('finds the tools of the n-th turn of a thread, oldest first, for its owner only', async () => {
    const threadId = randomUUID();
    const ids = [randomUUID(), randomUUID()];
    for (const [i, id] of ids.entries()) {
      await turns.start({ id, userId: alice, threadId, promptKey: 'system', promptVersion: 1, model: 'm', startedAt: `2026-11-10T10:0${String(i)}:00.000Z` });
      await turns.finish(id, { outcome: 'ok', tokens: 1, finishedAt: `2026-11-10T10:0${String(i)}:05.000Z`, tools: i === 0 ? ['getQuote'] : ['runBacktest', 'getBars'] });
    }
    expect(await signals.turnTools(alice, threadId, 0)).toEqual(['getQuote']);
    expect(await signals.turnTools(alice, threadId, 1)).toEqual(['runBacktest', 'getBars']);
    expect(await signals.turnTools(alice, threadId, 2)).toBeNull();
    expect(await signals.turnTools(bob, threadId, 0)).toBeNull();
  });
});
