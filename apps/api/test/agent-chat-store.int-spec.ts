import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/shared/database/schema';
import { NotFoundError } from '../src/shared/errors';
import { DrizzleThreadStore, DrizzleTurnStore } from '../src/modules/agent/infrastructure/drizzle-chat.stores';
import { DrizzleActionStore } from '../src/modules/agent/infrastructure/drizzle-action.store';
import { DrizzleTaskStore } from '../src/modules/agent/infrastructure/drizzle-task.store';
import { startPostgres } from './support/containers';

describe('agent chat stores (FR-AG-9, turn records)', () => {
  let container: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  let threads: DrizzleThreadStore;
  let turns: DrizzleTurnStore;
  let actions: DrizzleActionStore;
  let tasks: DrizzleTaskStore;
  const alice = randomUUID();
  const bob = randomUUID();
  beforeAll(async () => {
    container = await startPostgres();
    pool = new Pool({ connectionString: container.url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    for (const [id, name] of [[alice, 'alice'], [bob, 'bob']] as const) {
      await pool.query("INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, 'x', 'user')", [id, name]);
    }
    threads = new DrizzleThreadStore(db);
    turns = new DrizzleTurnStore(db);
    actions = new DrizzleActionStore(db);
    tasks = new DrizzleTaskStore(db);
  });
  afterAll(async () => { await pool.end(); await container.stop(); });

  it('creates a thread on first use, returns its history, and replaces it after each turn', async () => {
    const id = randomUUID();
    expect(await threads.ensure(alice, id, 'Price of Reliance?')).toEqual([]);
    await threads.saveMessages(alice, id, [{ id: 'm1', role: 'user' }, { id: 'a1', role: 'assistant' }]);
    expect(await threads.ensure(alice, id, 'ignored')).toEqual([{ id: 'm1', role: 'user' }, { id: 'a1', role: 'assistant' }]);
    expect((await threads.list(alice)).map(t => t.title)).toContain('Price of Reliance?');
  });

  it("another user's thread id is not found, never shared or overwritten", async () => {
    const id = randomUUID();
    await threads.ensure(alice, id, 'mine');
    await expect(threads.ensure(bob, id, 'theirs')).rejects.toBeInstanceOf(NotFoundError);
    await threads.saveMessages(bob, id, [{ id: 'evil' }]);
    expect(await threads.messages(alice, id)).toEqual([]);
    expect(await threads.messages(bob, id)).toBeNull();
    expect(await threads.rename(bob, id, 'x')).toBe(false);
    expect(await threads.remove(bob, id)).toBe(false);
  });

  it('renames and deletes, cascading messages', async () => {
    const id = randomUUID();
    await threads.ensure(alice, id, 'old');
    await threads.saveMessages(alice, id, [{ id: 'm1' }]);
    expect(await threads.rename(alice, id, 'new')).toBe(true);
    expect((await threads.list(alice)).find(t => t.id === id)?.title).toBe('new');
    expect(await threads.remove(alice, id)).toBe(true);
    expect((await pool.query('SELECT count(*)::int AS n FROM agent_messages WHERE thread_id = $1', [id])).rows[0]).toEqual({ n: 0 });
  });

  it('records which prompt version and model each turn used', async () => {
    const id = randomUUID();
    await turns.start({ id, userId: alice, threadId: randomUUID(), promptKey: 'system', promptVersion: 3, model: 'xai/grok-4', startedAt: '2026-11-10T10:00:00.000Z' });
    await turns.finish(id, { outcome: 'ok', tokens: 420, finishedAt: '2026-11-10T10:00:05.000Z' });
    const { rows } = await pool.query('SELECT prompt_version, model, outcome, tokens FROM agent_turns WHERE id = $1', [id]);
    expect(rows[0]).toEqual({ prompt_version: 3, model: 'xai/grok-4', outcome: 'ok', tokens: 420 });
  });

  it('action cards: owner-only reads and a compare-and-set on state (FR-AG-17)', async () => {
    const card = { id: randomUUID(), userId: alice, action: { kind: 'add-indicator' as const, indicatorId: 'rsi', inputs: { length: 14 } }, state: 'pending' as const,
      reason: null, drawing: null, createdAt: Date.parse('2026-11-10T10:00:00Z'), expiresAt: Date.parse('2026-11-10T10:15:00Z') };
    await actions.create(card);
    expect(await actions.get(alice, card.id)).toEqual(card);
    expect(await actions.get(bob, card.id)).toBeNull();
    expect(await actions.save({ ...card, state: 'dismissed' }, 'pending')).toBe(true);
    expect(await actions.save({ ...card, state: 'applied' }, 'pending')).toBe(false);
    expect((await actions.get(alice, card.id))?.state).toBe('dismissed');
    const drawn = { ...card, id: randomUUID(), action: { kind: 'draw' as const, intent: { kind: 'levels' as const, symbol: 'NSE:INFY', interval: '5' as const, bars: 300, count: 3 } },
      drawing: { symbol: 'NSE:INFY', interval: '5' as const, segments: [{ from: { time: 1, price: 100 }, to: { time: 2, price: 100 }, label: 'Support 100.00 · 3 touches' }],
        note: null, barsUsed: 300, lastBarTime: 2, status: { state: 'ok' as const } } };
    await actions.create(drawn);
    expect(await actions.get(alice, drawn.id)).toEqual(drawn);
  });

  it('background tasks round-trip, list per owner, and only active ones are picked up', async () => {
    const task = { id: randomUUID(), userId: alice, threadId: randomUUID(), title: 'INFY breakout', instruction: 'buy 10',
      trigger: { kind: 'price' as const, symbol: 'NSE:INFY', op: 'above' as const, value: 1500 }, state: 'active' as const, runs: 0, maxRuns: 1, armed: true,
      lastRunAt: null, nextRunAt: null, lastError: null, expiresAt: Date.parse('2026-11-12T00:00:00Z'), createdAt: Date.parse('2026-11-11T00:00:00Z') };
    await tasks.create(task);
    expect(await tasks.get(alice, task.id)).toEqual(task);
    expect(await tasks.get(bob, task.id)).toBeNull();
    expect((await tasks.active()).map(t => t.id)).toContain(task.id);
    await tasks.save({ ...task, state: 'done', runs: 1, armed: false, lastRunAt: Date.parse('2026-11-11T04:00:00Z'), lastError: 'x' });
    expect(await tasks.get(alice, task.id)).toMatchObject({ state: 'done', runs: 1, lastError: 'x' });
    expect((await tasks.active()).map(t => t.id)).not.toContain(task.id);
    expect((await tasks.list(alice)).map(t => t.id)).toContain(task.id);
  });
});
