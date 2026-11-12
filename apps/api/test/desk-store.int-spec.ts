import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeskRunDto } from '@aitrader/contracts';
import * as schema from '../src/shared/database/schema';
import { DrizzleDeskBacktestStore, DrizzleDeskRunStore } from '../src/modules/agent/infrastructure/drizzle-desk.stores';
import { startPostgres } from './support/containers';

describe('desk stores (migration 0031)', () => {
  let container: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  let runs: DrizzleDeskRunStore;
  let backtests: DrizzleDeskBacktestStore;
  const alice = randomUUID();
  const bob = randomUUID();
  beforeAll(async () => {
    container = await startPostgres();
    pool = new Pool({ connectionString: container.url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    for (const [id, name] of [[alice, 'alice'], [bob, 'bob']] as const) await pool.query("INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, 'x', 'user')", [id, name]);
    runs = new DrizzleDeskRunStore(db);
    backtests = new DrizzleDeskBacktestStore(db);
  });
  afterAll(async () => { await pool.end(); await container.stop(); });

  const run = (createdAt: string): DeskRunDto => ({ id: randomUUID(), symbol: 'NSE:INFY', asOf: '2026-11-10T04:30:00.000Z', live: false, createdAt, status: 'done', tokens: 100, calls: 7, error: null,
    decision: { action: 'HOLD', confidence: 0, entry: null, stopLoss: null, target: null, quantity: null, skill: null, summary: 's', vetoed: false, vetoReasons: [] },
    trail: { data: { asOf: '2026-11-10T04:30:00.000Z', lastClose: 100, bars: 1, headlines: 0, events: 0 }, reports: { news: { skipped: 'x' }, technical: { skipped: 'x' }, macro: { skipped: 'x' }, fundamentals: { skipped: 'x' } },
      debate: [], proposal: null, riskReview: null, gate: { pass: true, blocks: [] } } });

  it('stores desk runs per user, newest first, and counts those since a time', async () => {
    await runs.insert(alice, run('2026-11-12T04:00:00.000Z'));
    await runs.insert(alice, run('2026-11-12T06:00:00.000Z'));
    expect((await runs.list(alice, { limit: 10 })).map(r => r.createdAt)).toEqual(['2026-11-12T06:00:00.000Z', '2026-11-12T04:00:00.000Z']);
    expect(await runs.list(bob, { limit: 10 })).toEqual([]);
    expect(await runs.countSince(alice, Date.parse('2026-11-12T05:00:00Z'))).toBe(1);
  });

  it('saves backtest progress and returns it only to its owner', async () => {
    const id = randomUUID();
    const row = { id, userId: alice, symbol: 'NSE:INFY', request: { symbol: 'NSE:INFY', dates: ['2026-11-09'], rounds: 1, interval: '5' as const, horizonBars: 75 }, status: 'running' as const, done: 0, total: 1,
      items: [], summary: null, tokens: 0, createdAt: '2026-11-12T04:00:00.000Z', finishedAt: null, error: null };
    await backtests.insert(row);
    await backtests.save({ ...row, status: 'done', done: 1, tokens: 700, finishedAt: '2026-11-12T04:05:00.000Z',
      items: [{ asOf: '2026-11-09T04:30:00.000Z', action: 'HOLD', entry: null, stopLoss: null, target: null, outcome: 'no-trade', r: null, exitPrice: null, runId: null }],
      summary: { trades: 0, holds: 1, hitRatePct: null, avgR: null, totalR: 0, maxDrawdownR: 0 } });
    expect(await backtests.get(bob, id)).toBeNull();
    expect(await backtests.get(alice, id)).toMatchObject({ status: 'done', done: 1, tokens: 700, summary: { holds: 1 } });
    expect((await backtests.list(alice, 'NSE:INFY', 10)).map(b => b.id)).toEqual([id]);
  });
});
