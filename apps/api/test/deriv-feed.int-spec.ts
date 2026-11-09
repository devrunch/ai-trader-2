import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { WebSocketServer } from 'ws';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import * as schema from '../src/shared/database/schema';
import { startPostgres, startRedis } from './support/containers';
import { DrizzleCandleStore } from '../src/modules/market-data/infrastructure/drizzle-candle-store';
import { RedisFormingBarStore } from '../src/modules/market-data/infrastructure/redis-forming-bar-store';
import { DerivFeed } from '../src/modules/market-data/infrastructure/deriv/deriv.feed';
import { DerivHistoryProvider } from '../src/modules/market-data/infrastructure/deriv/deriv-history.provider';
import { LiveBars } from '../src/modules/market-data/application/live-bars';
import { FillHistory } from '../src/modules/market-data/application/fill-history';
import { calendarFor } from '../src/modules/market-data/domain/calendar';

const start = Date.parse('2026-11-09T10:00:00Z'); const id = 'OANDA:EURUSD';
const command = z.object({ ticks: z.string().optional(), forget: z.string().optional(), req_id: z.number().optional(), ticks_history: z.string().optional(), start: z.never().optional(), end: z.number().optional(), count: z.number().optional(), granularity: z.number().optional() });
const publicPath = '/trading/v1/options/ws/public';
describe('FR-MD-1 E1 E2 E5 Deriv socket integration', () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>>; let cache: Awaited<ReturnType<typeof startRedis>>;
  let pool: Pool; let redis: Redis; let store: DrizzleCandleStore; let forming: RedisFormingBarStore;
  let server: WebSocketServer; let feed: DerivFeed; let detach: () => void; let connections = 0;
  let now = start; let subscriptionIds: string[]; let forgotten: string[]; let histories = 0;
  beforeAll(async () => {
    [postgres, cache] = await Promise.all([startPostgres(), startRedis()]);
    pool = new Pool({ connectionString: postgres.url, connectionTimeoutMillis: 3000, options: '-c statement_timeout=5000' });
    redis = new Redis(cache.url, { commandTimeout: 3000 });
    const db = drizzle(pool, { schema }); await migrate(db, { migrationsFolder: './drizzle' });
    store = new DrizzleCandleStore(db); forming = new RedisFormingBarStore(redis);
  });
  beforeEach(async () => {
    await pool.query('truncate bars_1m'); await redis.flushdb(); now = start; connections = 0; histories = 0; subscriptionIds = []; forgotten = [];
    server = new WebSocketServer({ port: 0, host: '127.0.0.1', path: publicPath });
    await new Promise<void>(resolve => { server.once('listening', resolve); });
    server.on('connection', (socket, upgrade) => {
      expect(upgrade.url).toBe(publicPath);
      const serial = ++connections;
      socket.on('message', raw => {
        if (!Buffer.isBuffer(raw)) throw new Error('Expected text buffer');
        const value: unknown = JSON.parse(raw.toString('utf8')); const request = command.parse(value);
        if (request.ticks) {
          const subscriptionId = `subscription-${String(serial)}`; subscriptionIds.push(subscriptionId);
          socket.send(JSON.stringify({ tick: { symbol: request.ticks, epoch: now / 1000, quote: 1.2 }, subscription: { id: subscriptionId }, req_id: request.req_id }));
        }
        if (request.forget) forgotten.push(request.forget);
        if (request.ticks_history) {
          histories++;
          expect(request.count).toBe(1000);
          const granularity = request.granularity ?? 60; const end = Math.floor((request.end ?? 0) / granularity) * granularity;
          const candles = Array.from({ length: Math.min(request.count ?? 1000, 1000) }, (_, i) => ({ epoch: end - i * granularity, open: 1, high: 2, low: 1, close: 2 }))
            .filter(candle => calendarFor('FX').isOpen(candle.epoch * 1000)).reverse();
          socket.send(JSON.stringify({ req_id: request.req_id, msg_type: 'candles', candles }));
        }
      });
    });
    const address = server.address(); if (typeof address === 'string' || !address) throw new Error('No server port');
    const root = `ws://127.0.0.1:${String(address.port)}${publicPath}`;
    const instruments = { getMapping: () => Promise.resolve({ providerSymbol: 'frxEURUSD', volumeType: 'none' as const }), held: () => Promise.resolve([id]) };
    const provider = new DerivHistoryProvider({ root });
    feed = new DerivFeed({ root, instruments, fill: new FillHistory(store, instruments, new Map([['deriv', provider]])), store, clock: () => now, log: vi.fn(), watchdogMs: 100 });
    detach = new LiveBars(store, forming, { clock: () => now, log: vi.fn() }).attach(feed);
    await feed.subscribe([id]); await feed.start();
    await vi.waitFor(() => { expect(subscriptionIds).toHaveLength(1); });
  });
  afterEach(async () => {
    await feed.stop(); detach(); for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve(); }); });
  });
  afterAll(async () => { await redis.quit(); await pool.end(); await Promise.all([postgres.stop(), cache.stop()]); });
  it('ticks become stored 1-minute bars with null volume', async () => {
    await vi.waitFor(async () => { expect((await forming.get(id))?.bar.volume).toBeNull(); });
    for (const socket of server.clients) socket.send(JSON.stringify({ tick: { symbol: 'frxEURUSD', epoch: (start + 60000) / 1000, quote: 1.3 } }));
    await vi.waitFor(async () => { expect((await store.range1m(id, start, start + 60000))[0]).toMatchObject({ time: start, close: 1.2, volume: null }); });
  });
  it('server kill reconnects, resubscribes with new subscription ids and backfills', async () => {
    await vi.waitFor(async () => { expect(await forming.get(id)).not.toBeNull(); });
    now += 180000; for (const socket of server.clients) socket.terminate();
    await vi.waitFor(() => { expect(subscriptionIds).toHaveLength(2); }, { timeout: 10_000 });
    expect(subscriptionIds[1]).not.toBe(subscriptionIds[0]);
    await vi.waitFor(async () => { expect((await store.range1m(id, start, now)).map(bar => [bar.time, bar.repaired, bar.volume])).toEqual([[start, true, null], [start + 60000, true, null], [start + 120000, true, null]]); }, { timeout: 10_000 });
    expect(histories).toBe(1);
    feed.disconnectSocket(); await vi.waitFor(() => { expect(subscriptionIds).toHaveLength(3); }, { timeout: 10_000 });
    await feed.unsubscribe([id]);
  });
  it('silent server during FX hours triggers watchdog reconnect', async () => {
    const states = vi.fn(); feed.onState(states); now += 100;
    await vi.waitFor(() => { expect(subscriptionIds.length).toBeGreaterThanOrEqual(2); }, { timeout: 10_000 });
    expect(states).toHaveBeenCalledWith('reconnecting', 'watchdog');
  });
  it('no watchdog on Saturday', async () => {
    now = Date.parse('2026-11-14T12:00:00Z');
    await new Promise(resolve => setTimeout(resolve, 350)); expect(subscriptionIds).toHaveLength(1); expect(forgotten).toEqual([]);
  });
});
