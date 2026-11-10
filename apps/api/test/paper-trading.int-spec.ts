import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../src/shared/database/schema/index.js';
import type { Database } from '../src/shared/database/index.js';
import { DrizzlePaperStore } from '../src/modules/paper-trading/infrastructure/drizzle-paper-store.js';
import { PlaceOrder } from '../src/modules/paper-trading/application/place-order.js';
import { MatchOpenOrders } from '../src/modules/paper-trading/application/match-open-orders.js';
import { SquareOff } from '../src/modules/paper-trading/application/square-off.js';
import { ReadPortfolio } from '../src/modules/paper-trading/application/read-portfolio.js';
import { DEFAULT_PAPER_SETTINGS, type PaperDeps } from '../src/modules/paper-trading/application/paper-settings.js';
import { FakeMarket, INFY, NOW, SQUARE_OFF } from '../src/modules/paper-trading/application/paper.spec-helper.js';
import { startPostgres } from './support/containers.js';

describe('paper trading persistence FR-PT-1, FR-PT-3, FR-PT-5, NFR-RB-4, E17', () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>> | undefined;
  let pool: Pool | undefined; let db: Database | undefined;
  let store: DrizzlePaperStore; let market: FakeMarket; let deps: PaperDeps; let userId: string; const clock = { now: NOW };

  beforeAll(async () => {
    postgres = await startPostgres();
    pool = new Pool({ connectionString: postgres.url, options: '-c statement_timeout=5000' });
    db = Object.assign(drizzle(pool, { schema }), { $client: pool });
    await migrate(db, { migrationsFolder: './drizzle' });
  });
  afterAll(async () => { await pool?.end(); await postgres?.stop(); });
  beforeEach(async () => {
    if (!pool || !db) throw new Error('Postgres is unavailable');
    userId = randomUUID(); clock.now = NOW;
    await pool.query("INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, 'x', 'user')", [userId, `u${userId.slice(0, 8)}`]);
    store = new DrizzlePaperStore(db); market = new FakeMarket();
    market.quotes.set(INFY.id, { price: 1500, at: NOW - 30_000 });
    deps = { clock: () => clock.now, ids: randomUUID, settings: { ...DEFAULT_PAPER_SETTINGS, slippageRate: 0 } };
  });
  const order = (clientOrderId: string, patch: Record<string, unknown> = {}) => ({
    clientOrderId, instrumentId: INFY.id, side: 'buy' as const, type: 'market' as const, product: 'MIS' as const, quantity: 10, ...patch });

  it('creates one account per user even when asked concurrently', async () => {
    const accounts = await Promise.all([store.accountFor(userId, 1e6), store.accountFor(userId, 1e6), store.accountFor(userId, 5)]);
    expect(new Set(accounts.map(a => a.id)).size).toBe(1);
    expect(accounts[2]).toMatchObject({ initialCash: 1e6, cash: 1e6, currency: 'INR' });
  });

  it('stores one order and one fill for five concurrent placements with the same clientOrderId', async () => {
    const place = new PlaceOrder(store, market, deps);
    const results = await Promise.all(Array.from({ length: 5 }, () => place.execute(userId, order('retry-1'))));
    expect(new Set(results.map(r => r.id)).size).toBe(1);
    const rows = await pool?.query('SELECT count(*)::int AS n FROM paper_orders o JOIN paper_accounts a ON a.id = o.account_id WHERE a.user_id = $1', [userId]);
    const fills = await pool?.query('SELECT count(*)::int AS n FROM paper_fills f JOIN paper_accounts a ON a.id = f.account_id WHERE a.user_id = $1', [userId]);
    expect([rows?.rows[0], fills?.rows[0]]).toEqual([{ n: 1 }, { n: 1 }]);
  });

  it('fills a resting order once when matching passes overlap, and refuses a second fill row', async () => {
    const place = new PlaceOrder(store, market, deps);
    const resting = await place.execute(userId, order('limit-1', { type: 'limit', limitPrice: 1490 }));
    market.bars.set(INFY.id, [{ time: Math.floor(NOW / 60_000) * 60_000 + 60_000, open: 1495, high: 1496, low: 1485, close: 1488 }]);
    const match = new MatchOpenOrders(store, market, deps);
    const results = await Promise.all([match.execute(), match.execute(), match.execute()]);
    expect(results.reduce((sum, r) => sum + r.filled, 0)).toBe(1);
    const portfolio = new ReadPortfolio(store, market, deps);
    expect(await portfolio.positions(userId)).toEqual([expect.objectContaining({ quantity: 10, averagePrice: 1490, lastPrice: 1500, unrealisedPnl: 100 })]);
    const [fill] = await portfolio.fills(userId, 10);
    expect(fill).toMatchObject({ orderId: resting.id, price: 1490, charges: { brokerage: 4.47, stt: 0 } });
    await expect(pool?.query(`INSERT INTO paper_fills SELECT gen_random_uuid(), order_id, account_id, instrument_id, side, product, quantity, price, slippage,
      brokerage, stt, exchange_charges, sebi, stamp, gst, total_charges, realised_pnl, filled_at FROM paper_fills WHERE order_id = $1`, [resting.id])).rejects.toThrow(/paper_fills_order_unique/);
  });

  it('squares off MIS positions once and keeps the account consistent', async () => {
    await new PlaceOrder(store, market, deps).execute(userId, order('mis-1'));
    clock.now = SQUARE_OFF + 1000;
    market.quotes.set(INFY.id, { price: 1510, at: SQUARE_OFF });
    const squareOff = new SquareOff(store, market, deps, new MatchOpenOrders(store, market, deps));
    await Promise.all([squareOff.execute(), squareOff.execute()]);
    expect(await squareOff.execute()).toEqual({ expired: 0, squaredOff: 0 });
    const portfolio = new ReadPortfolio(store, market, deps);
    const account = await portfolio.account(userId);
    expect(account).toMatchObject({ realisedPnl: 100, usedMargin: 0 });
    expect(account.cash).toBeCloseTo(1e6 + 100 - account.charges, 2);
    expect((await portfolio.orders(userId, { openOnly: false, limit: 10 })).map(o => o.clientOrderId)).toEqual([expect.stringMatching(/^squareoff#/), 'mis-1']);
  });

  it('rolls back every write when the work fails', async () => {
    const account = await store.accountFor(userId, 1e6);
    await expect(store.inAccount(account.id, async tx => {
      await tx.saveAccount({ cash: 1, realisedPnl: 0, charges: 0 });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect((await store.accountFor(userId, 1e6)).cash).toBe(1e6);
  });
});
