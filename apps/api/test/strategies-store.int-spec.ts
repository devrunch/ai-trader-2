import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BacktestSpec } from '@aitrader/contracts';
import * as schema from '../src/shared/database/schema';
import { DrizzleStrategyStore } from '../src/modules/strategies/infrastructure/drizzle-strategy.store';
import { DrizzleTradeJournal } from '../src/modules/agent/infrastructure/drizzle-trade-journal';
import { startPostgres } from './support/containers';

const spec: BacktestSpec = { symbol: 'NSE:INFY', interval: '5', bars: 2000, indicators: [], costs: { commissionPct: 0.03, slippagePct: 0.02 },
  strategy: { side: 'long', entry: { kind: 'compare', left: { kind: 'series', name: 'close' }, op: 'gt', right: { kind: 'value', value: 0 } } } };

describe('strategies and trade journal stores (migrations 0028-0030)', () => {
  let container: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  let strategies: DrizzleStrategyStore;
  let journal: DrizzleTradeJournal;
  const alice = randomUUID();
  const bob = randomUUID();
  beforeAll(async () => {
    container = await startPostgres();
    pool = new Pool({ connectionString: container.url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    for (const [id, name] of [[alice, 'alice'], [bob, 'bob']] as const) await pool.query("INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, 'x', 'user')", [id, name]);
    strategies = new DrizzleStrategyStore(db);
    journal = new DrizzleTradeJournal(db);
  });
  afterAll(async () => { await pool.end(); await container.stop(); });

  it('stores a strategy per user and counts each distinct parameter set once, even when runs race', async () => {
    const id = randomUUID();
    const at = '2026-11-12T04:00:00.000Z';
    await strategies.insert({ id, userId: alice, name: 'EMA cross', spec, variantHashes: [], createdAt: at, updatedAt: at });
    expect(await strategies.get(bob, id)).toBeNull();
    const counts = await Promise.all(['a', 'b', 'a', 'c', 'b', 'a'].map(h => strategies.addVariant(alice, id, h)));
    expect(counts.every(c => c !== null && c >= 1 && c <= 3)).toBe(true);
    expect((await strategies.get(alice, id))?.variantHashes.slice().sort()).toEqual(['a', 'b', 'c']);
    expect(await strategies.addVariant(bob, id, 'z')).toBeNull();
    expect(await strategies.update(alice, id, { name: 'renamed', updatedAt: at })).toBe(true);
    expect((await strategies.get(alice, id))).toMatchObject({ name: 'renamed', spec });
    expect(await strategies.count(alice)).toBe(1);
    expect(await strategies.remove(bob, id)).toBe(false);
    expect(await strategies.remove(alice, id)).toBe(true);
  });

  it('journals a trade and a skipped trade once each, newest first, and counts a task\'s trades since a time', async () => {
    const taskId = randomUUID();
    const row = (clientOrderId: string, createdAt: string, skipped: string | null) => ({ id: randomUUID(), userId: alice, createdAt, venue: 'paper' as const, taskId, trigger: 'RBI watch', skill: null,
      rationale: 'why', symbol: 'NSE:INFY', side: 'buy' as const, quantity: 10, entry: 1500, stopLoss: 1480, target: null, riskAmount: 200, currency: 'INR', backtest: null, clientOrderId, skipped });
    await journal.add(row('agent-1', '2026-11-12T04:00:00.000Z', null));
    await journal.add(row('agent-1', '2026-11-12T04:00:00.000Z', null));
    await journal.add(row('agent-2', '2026-11-12T05:00:00.000Z', 'backtest has 12 trades; at least 20 are needed'));
    expect((await journal.list(alice, 10)).map(r => [r.clientOrderId, r.skipped])).toEqual([['agent-2', 'backtest has 12 trades; at least 20 are needed'], ['agent-1', null]]);
    expect(await journal.list(bob, 10)).toEqual([]);
    expect(await journal.countSince(taskId, Date.parse('2026-11-12T04:30:00Z'))).toBe(1);
  });
});
