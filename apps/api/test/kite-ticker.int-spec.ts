import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../src/shared/database/schema';
import { DrizzleCandleStore } from '../src/modules/market-data/infrastructure/drizzle-candle-store';
import { RedisFormingBarStore } from '../src/modules/market-data/infrastructure/redis-forming-bar-store';
import { KiteTickerFeed } from '../src/modules/market-data/infrastructure/kite/kite-ticker.feed';
import { LiveBars } from '../src/modules/market-data/application/live-bars';
import { FillHistory } from '../src/modules/market-data/application/fill-history';
import type { MarketDataProvider } from '../src/modules/market-data/application/ports/market-data-provider';
import { startPostgres, startRedis } from './support/containers';
import { kiteSocket } from './support/kite-socket';
import { CircuitBreaker } from '@aitrader/resilience';
import { KiteTickerClient } from '../src/modules/market-data/infrastructure/kite/kite-ticker.client';
import { SubscriptionManager } from '../src/modules/market-data/infrastructure/kite/subscription-manager';
import { KiteWsClient, type TickerMapping } from '../src/modules/market-data/infrastructure/kite/kite-ws.client';
import { encodeKitePackets, kitePacket } from './support/kite-packets';

const start = Date.parse('2026-11-09T03:45:00Z'); const id = 'NSE:TEST';
describe('FR-MD-2 E1 E2 E11 E12 Kite ticker integration', () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>>; let cache: Awaited<ReturnType<typeof startRedis>>;
  let pool: Pool; let redis: Redis; let store: DrizzleCandleStore; let forming: RedisFormingBarStore;
  let socket: Awaited<ReturnType<typeof kiteSocket>>; let feed: KiteTickerFeed; let detach: () => void;
  let now = start; const logs = vi.fn();
  beforeAll(async () => {
    [postgres, cache] = await Promise.all([startPostgres(), startRedis()]);
    pool = new Pool({ connectionString: postgres.url, connectionTimeoutMillis: 3000, options: '-c statement_timeout=5000' });
    redis = new Redis(cache.url, { commandTimeout: 3000 });
    const db = drizzle(pool, { schema }); await migrate(db, { migrationsFolder: './drizzle' });
    store = new DrizzleCandleStore(db); forming = new RedisFormingBarStore(redis);
  });
  beforeEach(async () => {
    await pool.query('truncate bars_1m'); await redis.flushdb(); logs.mockClear(); now = start;
    socket = await kiteSocket();
    const instruments = { getMapping: () => Promise.resolve({ providerSymbol: 'TEST', providerToken: '1000/256001', volumeType: 'real' as const }), held: () => Promise.resolve([id]) };
    const provider: MarketDataProvider = { name: 'kite', history: (_m, _r, from, to) => Promise.resolve({ ok: true, data:
      Array.from({ length: Math.floor((to - from) / 60000) }, (_, i) => ({ time: from + i * 60000, open: 20, high: 21, low: 19, close: 20, volume: 10 })) }) };
    feed = new KiteTickerFeed({ session: { getAccessToken: () => Promise.resolve('test'), refresh: () => Promise.resolve() }, instruments,
      fill: new FillHistory(store, instruments, new Map([['kite', provider]])), store, apiKey: 'test', root: socket.root, clock: () => now, log: logs, watchdogMs: 100 });
    detach = new LiveBars(store, forming, { clock: () => now, log: logs }).attach(feed);
    await feed.subscribe([id]); await feed.start();
  });
  afterEach(async () => { await feed.stop(); detach(); await socket.stop(); });
  afterAll(async () => { await redis.quit(); await pool.end(); await Promise.all([postgres.stop(), cache.stop()]); });
  it('ticks become stored 1-minute bars end to end', async () => {
    socket.tick(start, 10, 100);
    await vi.waitFor(async () => { expect((await forming.get(id))?.bar.close).toBe(10); });
    socket.tick(start + 60000, 12, 110);
    await vi.waitFor(async () => { expect((await store.range1m(id, start, start + 60000))[0]).toMatchObject({ time: start, open: 10, close: 10, volume: 0 }); });
    await vi.waitFor(async () => { expect((await forming.get(id))?.bar).toMatchObject({ time: start + 60000, close: 12, volume: 10 }); });
    expect(logs).not.toHaveBeenCalled();
  });
  it('server kill mid-session reconnects and backfilled minutes are marked repaired', async () => {
    socket.tick(start, 10, 100); await vi.waitFor(async () => { expect(await forming.get(id)).not.toBeNull(); });
    socket.kill(); now = start + 180000;
    await vi.waitFor(() => { expect(socket.count()).toBeGreaterThanOrEqual(2); });
    await vi.waitFor(async () => {
      const bars = await store.range1m(id, start, now);
      expect(bars.map(bar => [bar.time, bar.repaired])).toEqual([[start, true], [start + 60000, true], [start + 120000, true]]);
    });
    expect(socket.commands.filter(command => JSON.stringify(command).includes('subscribe')).length).toBeGreaterThanOrEqual(2);
  });
  it('a silent server is detected and reconnected', async () => {
    const states = vi.fn(); feed.onState(states); now += 100;
    await vi.waitFor(() => { expect(socket.count()).toBeGreaterThanOrEqual(2); });
    expect(states).toHaveBeenCalledWith('reconnecting', 'watchdog');
  });
  it('opens independent pooled sockets and sends at most 3000 tokens to each (FR-MD-4)', async () => {
    await feed.stop(); const manager = new SubscriptionManager(); const mappings = new Map<string, TickerMapping>();
    for (let i = 1; i <= 3001; i++) { const key = String(i * 256 + 1); manager.add(key); mappings.set(key, { id: `NSE:T${String(i)}`, token: Number(key), volume: true }); }
    const client = new KiteTickerClient('test', () => Promise.resolve('test'), manager, mappings,
      new CircuitBreaker({ failureThreshold: 3, openMs: 1000 }), socket.root);
    try {
      await client.connect(AbortSignal.timeout(5000)); client.sendSubscribe([...mappings.keys()]);
      await vi.waitFor(() => { expect(socket.count()).toBe(3); });
      await vi.waitFor(() => {
        const sizes = socket.commands.flatMap(command => {
          if (typeof command !== 'object' || command === null || !('a' in command) || command.a !== 'subscribe' || !('v' in command) || !Array.isArray(command.v)) return [];
          return [command.v.length];
        });
        expect(sizes).toEqual([1, 3000, 1]);
      });
    } finally { client.close(); }
  });
  it('two client instances hold independent sockets', async () => {
    const [a, b] = await Promise.all([kiteSocket(), kiteSocket()]); const receivedA = vi.fn(); const receivedB = vi.fn();
    const create = (root: string, canonicalId: string) => new KiteWsClient({ apiKey: 'key +&', accessToken: 'token +&', root, warn: logs,
      mappings: new Map([['256001', { id: canonicalId, token: 256001, volume: true }]]), clock: () => now });
    const first = create(a.root, 'NSE:A'); const second = create(b.root, 'NSE:B');
    first.onMessage(receivedA); second.onMessage(receivedB);
    try {
      await Promise.all([first.connect(AbortSignal.timeout(5000)), second.connect(AbortSignal.timeout(5000))]);
      first.sendSubscribe(['256001']); second.sendSubscribe(['256001']);
      a.tick(start, 11, 100); await vi.waitFor(() => { expect(receivedA).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ instrumentId: 'NSE:A', at: start, price: 11, cumVolume: 100 })]); });
      expect(receivedB).not.toHaveBeenCalled();
      b.tick(start + 1000, 22, 200); await vi.waitFor(() => { expect(receivedB).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ instrumentId: 'NSE:B', at: start + 1000, price: 22, cumVolume: 200 })]); });
      first.close(); b.tick(start + 2000, 23, 201);
      await vi.waitFor(() => { expect(receivedB).toHaveBeenCalledTimes(2); }); expect(receivedA).toHaveBeenCalledOnce();
    } finally { first.close(); second.close(); await Promise.all([a.stop(), b.stop()]); }
  });
  it('counts heartbeat liveness without emitting ticks and warns on auth error frames (E2 E3)', async () => {
    const server = await kiteSocket(); const warn = vi.fn(); const ticks = vi.fn(); const closed = vi.fn();
    const client = new KiteWsClient({ apiKey: 'key', accessToken: 'token', root: server.root, warn, mappings: new Map(), clock: () => now });
    client.onMessage(ticks); client.onClose(closed);
    try {
      await client.connect(AbortSignal.timeout(5000)); now += 1234; server.heartbeat();
      await vi.waitFor(() => { expect(client.lastActivityAt).toBe(now); }); expect(ticks).not.toHaveBeenCalled();
      server.text({ type: 'message', data: 'informational' }); server.text({ type: 'order', data: { id: 'test' } });
      server.text({ type: 'error', data: { error_type: 'TokenException', message: 'Token is invalid' } });
      await vi.waitFor(() => { expect(closed).toHaveBeenCalledExactlyOnceWith('AUTH_EXPIRED'); });
      expect(warn).toHaveBeenCalledExactlyOnceWith('Kite WebSocket error frame: AUTH_EXPIRED'); expect(ticks).not.toHaveBeenCalled();
    } finally { client.close(); await server.stop(); }
  });
  it('sends the documented commands and maps full and index ticks with timestamp fallback (FR-MD-4)', async () => {
    const server = await kiteSocket(); const ticks = vi.fn();
    const client = new KiteWsClient({ apiKey: 'key +&', accessToken: 'token +&', root: server.root, warn: logs, clock: () => now,
      mappings: new Map([['256001', { id, token: 256001, volume: true }], ['265', { id: 'NSE:NIFTY', token: 265, volume: false }]]) });
    client.onMessage(ticks);
    try {
      await client.connect(AbortSignal.timeout(5000)); client.sendSubscribe(['256001', '265']);
      await vi.waitFor(() => { expect(server.commands).toEqual([{ a: 'subscribe', v: [256001, 265] }, { a: 'mode', v: ['full', [256001]] }, { a: 'mode', v: ['full', [265]] }]); });
      const url = new URL(server.urls[0] ?? '', server.root);
      expect(url.searchParams.get('api_key')).toBe('key +&'); expect(url.searchParams.get('access_token')).toBe('token +&');
      server.binary(encodeKitePackets([kitePacket(184, 256001, [[4, 1234], [16, 500], [44, start / 1000 + 1]]), kitePacket(8, 265, [[4, 2100000]])]));
      await vi.waitFor(() => { expect(ticks).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ instrumentId: id, at: start + 1000, price: 12.34, cumVolume: 500 }), expect.objectContaining({ instrumentId: 'NSE:NIFTY', at: now, price: 21000, cumVolume: null })]); });
      client.sendUnsubscribe(['265']); await vi.waitFor(() => { expect(server.commands.at(-1)).toEqual({ a: 'unsubscribe', v: [265] }); });
      server.binary(encodeKitePackets([kitePacket(8, 265, [[4, 2200000]])])); now += 1; server.heartbeat();
      await vi.waitFor(() => { expect(client.lastActivityAt).toBe(now); }); expect(ticks).toHaveBeenCalledOnce();
    } finally { client.close(); await server.stop(); }
  });
  it('keeps the socket open on real Kite frames, including instruments_meta, and decodes them (E1 live finding 2026-11-09)', async () => {
    const live = JSON.parse(readFileSync(resolve(__dirname, '../src/modules/market-data/infrastructure/kite/kite-live-frames.fixture.json'), 'utf8')) as
      { framesBySize: Record<string, string[]>; textFrames: string[] };
    const server = await kiteSocket(); const ticks = vi.fn(); const closed = vi.fn();
    const client = new KiteWsClient({ apiKey: 'key', accessToken: 'token', root: server.root, warn: logs, clock: () => now,
      mappings: new Map([['738561', { id: 'NSE:RELIANCE', token: 738561, volume: true }], ['256265', { id: 'NSE:NIFTY', token: 256265, volume: false }]]) });
    client.onMessage(ticks); client.onClose(closed);
    try {
      await client.connect(AbortSignal.timeout(5000)); client.sendSubscribe(['738561', '256265']);
      for (const text of live.textFrames) server.text(JSON.parse(text) as object);
      for (const frames of Object.values(live.framesBySize)) for (const hex of frames) server.binary(Uint8Array.from(Buffer.from(hex, 'hex')).buffer);
      await vi.waitFor(() => { expect(ticks.mock.calls.flat(2).some((t: { instrumentId: string }) => t.instrumentId === 'NSE:RELIANCE')).toBe(true); });
      expect(ticks.mock.calls.flat(2).some((t: { instrumentId: string }) => t.instrumentId === 'NSE:NIFTY')).toBe(true);
      expect(closed).not.toHaveBeenCalled();
    } finally { client.close(); await server.stop(); }
  });
  it('stamps index ticks with the exchange timestamp from real full-mode frames (live finding 2026-11-09)', async () => {
    const live = JSON.parse(readFileSync(resolve(__dirname, '../src/modules/market-data/infrastructure/kite/kite-live-frames.fixture.json'), 'utf8')) as
      { indexFull: { frames: string[] } };
    const server = await kiteSocket(); const ticks = vi.fn();
    const client = new KiteWsClient({ apiKey: 'key', accessToken: 'token', root: server.root, warn: logs, clock: () => now,
      mappings: new Map([['256265', { id: 'NSE:NIFTY', token: 256265, volume: false }]]) });
    client.onMessage(ticks);
    try {
      await client.connect(AbortSignal.timeout(5000)); client.sendSubscribe(['256265']);
      await vi.waitFor(() => { expect(server.commands).toContainEqual({ a: 'mode', v: ['full', [256265]] }); });
      server.binary(Uint8Array.from(Buffer.from(live.indexFull.frames[0] ?? '', 'hex')).buffer);
      await vi.waitFor(() => { expect(ticks).toHaveBeenCalledOnce(); });
      expect(ticks.mock.calls[0]?.[0]).toEqual([{ instrumentId: 'NSE:NIFTY', at: 1794210349000, price: 24892.95, cumVolume: null, prevClose: 24986.4 }]);
    } finally { client.close(); await server.stop(); }
  });
  it('reports an HTTP 403 handshake as AUTH_EXPIRED without leaking credentials (E3)', async () => {
    const server = await kiteSocket(true); const closed = vi.fn();
    const client = new KiteWsClient({ apiKey: 'secret-key', accessToken: 'secret-token', root: server.root, warn: logs, mappings: new Map() });
    client.onClose(closed);
    try {
      await expect(client.connect(AbortSignal.timeout(5000))).rejects.toThrow('AUTH_EXPIRED');
      expect(closed).toHaveBeenCalledExactlyOnceWith('AUTH_EXPIRED');
    } finally { client.close(); await server.stop(); }
  });
});
