import { createServer, type Server as HttpServer } from 'node:http';
import { Redis } from 'ioredis';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AggregateLiveBars, ReadSeq, RequestSubscription } from '../src/modules/market-data/application/index';
import { RedisBarPublisher } from '../src/modules/market-data/infrastructure/redis-bar-publisher';
import { RedisBarSequenceStore } from '../src/modules/market-data/infrastructure/redis-bar-sequence-store';
import { FeedStatePublisher } from '../src/modules/market-data/infrastructure/process/feed-state.publisher';
import { RedisSubscriptionLeases } from '../src/modules/market-data/infrastructure/redis-subscription-leases';
import { LiveSubscriptions } from '../src/modules/live/application/live-subscriptions';
import type { LiveData } from '../src/modules/live/application/ports/live-data';
import { RedisLiveUpdateBus } from '../src/modules/live/infrastructure/redis-live-update-bus';
import { LiveGateway } from '../src/modules/live/api/live.gateway';
import { startPostgres, startRedis } from './support/containers';

describe('live socket integration (FR-LS-1, FR-LS-2, FR-LS-4, E10, E11, E16, E24, NFR-SC-1, NFR-RB-1)', () => {
  let pg: Awaited<ReturnType<typeof startPostgres>> | undefined;
  let cache: Awaited<ReturnType<typeof startRedis>> | undefined;
  let redis: Redis | undefined;
  let server: HttpServer | undefined;
  let gateway: LiveGateway | undefined;
  let bus: RedisLiveUpdateBus | undefined;
  let leases: RedisSubscriptionLeases | undefined;
  let client: Socket | undefined;

  beforeAll(async () => { pg = await startPostgres(); cache = await startRedis(); redis = new Redis(cache.url); await redis.ping(); });
  beforeEach(async () => { await redis?.flushdb(); });
  afterEach(async () => { client?.disconnect(); client = undefined; await gateway?.close(); gateway = undefined; bus?.close(); bus = undefined; await leases?.onModuleDestroy(); leases = undefined; });
  afterAll(async () => {
    redis?.disconnect(); await cache?.stop(); await pg?.stop();
  });

  async function startClient(): Promise<Socket> {
    if (!redis) throw new Error('Redis is unavailable');
    bus = new RedisLiveUpdateBus(redis); await bus.start();
    leases = new RedisSubscriptionLeases(redis, `test-api-${String(Math.random())}`);
    const seq = new ReadSeq(new RedisBarSequenceStore(redis));
    const requests = new RequestSubscription(leases);
    const data: LiveData = {
      resolve: symbol => Promise.resolve(symbol === 'NSE:TEST' ? 'NSE:TEST' : null),
      read: () => Promise.resolve({ bars: [], status: { state: 'ok' } }),
      current: id => seq.current(id), replay: (id, after) => seq.replay(id, after),
      watch: (id, listener) => { if (!bus) throw new Error('Live update bus unavailable'); return bus.watch(id, listener); },
      acquire: id => requests.acquire(id), release: id => requests.release(id),
      acquireSeconds: (id, interval) => requests.acquireSeconds(id, interval), releaseSeconds: (id, interval) => requests.releaseSeconds(id, interval),
      watchSeconds: (id, interval, listener) => { if (!bus) throw new Error('Live update bus unavailable'); return bus.watchSeconds(id, interval, listener); },
      aggregate: (bars, interval, id) => new AggregateLiveBars().execute(bars, interval, id),
    };
    const streams = new LiveSubscriptions(data);
    server = createServer(); gateway = new LiveGateway({ execute: session => Promise.resolve(session ? { id: 'user-1', username: 'user', role: 'user' } : null) }, {}, streams);
    gateway.attach(server); await new Promise<void>(resolve => server?.listen(0, resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No socket server address');
    client = io(`http://127.0.0.1:${String(address.port)}`, { path: '/api/socket.io', transports: ['websocket'], extraHeaders: { cookie: 'aitrader_session=valid' }, reconnection: false });
    await new Promise<void>((resolve, reject) => { client?.once('connect', resolve); client?.once('connect_error', reject); });
    return client;
  }

  it('subscribe receives snapshot then live bars in seq order', async () => {
    if (!redis) throw new Error('Redis is unavailable');
    const socket = await startClient();
    const bars: number[] = [];
    socket.on('bar', (value: { seq: number }) => bars.push(value.seq));
    const snapshot = new Promise<{ seq: number }>(resolve => socket.once('snapshot', resolve));
    await subscribe(socket);
    expect(await snapshot).toMatchObject({ seq: 0 });
    const next = new Promise<void>(resolve => socket.once('bar', () => { resolve(); }));
    const bar = { time: 1794195900000, open: 10, high: 11, low: 9, close: 10, volume: 1 };
    await new RedisBarPublisher(redis).publish('NSE:TEST', 'forming', bar);
    await next;
    expect(bars).toEqual([1]);
  });

  it('unauthenticated connect is rejected', async () => {
    server = createServer(); gateway = new LiveGateway({ execute: () => Promise.resolve(null) });
    gateway.attach(server); await new Promise<void>(resolve => server?.listen(0, resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No socket server address');
    client = io(`http://127.0.0.1:${String(address.port)}`, { path: '/api/socket.io', transports: ['websocket'], reconnection: false });
    const error = await new Promise<Error>(resolve => client?.once('connect_error', resolve));
    expect(socketErrorData(error)).toEqual({ code: 'UNAUTHORIZED' });
  });

  it('reconnect with afterSeq receives only missed updates', async () => {
    if (!redis) throw new Error('Redis is unavailable');
    const publisher = new RedisBarPublisher(redis);
    const bar = { time: 1794195900000, open: 10, high: 11, low: 9, close: 10, volume: 1 };
    await publisher.publish('NSE:TEST', 'forming', bar);
    const first = await startClient();
    const firstSnapshot = new Promise<{ seq: number }>(resolve => first.once('snapshot', resolve));
    await subscribe(first); expect(await firstSnapshot).toMatchObject({ seq: 1 });
    first.disconnect(); client = undefined; await gateway?.close(); gateway = undefined; bus?.close(); bus = undefined; await leases?.onModuleDestroy(); leases = undefined;
    const second = await startClient();
    const received: number[] = []; second.on('bar', (value: { seq: number }) => received.push(value.seq));
    const delivered = new Promise<void>(resolve => second.once('bar', () => { resolve(); }));
    await publisher.publish('NSE:TEST', 'forming', { ...bar, time: bar.time + 60_000 });
    const ack = await subscribe(second, 1);
    expect(ack).toMatchObject({ ok: true });
    await delivered;
    expect(received).toEqual([2]);
  });

  it('status changes reach subscribers', async () => {
    if (!redis) throw new Error('Redis is unavailable');
    const socket = await startClient();
    const initial = new Promise(resolve => socket.once('snapshot', resolve));
    await subscribe(socket); await initial;
    const status = new Promise<{ status: { state: string } }>(resolve => socket.once('status', resolve));
    await new FeedStatePublisher(redis).publish('kite', 'stale', 'PROVIDER_DOWN');
    expect(await status).toMatchObject({ status: { state: 'stale', reason: 'PROVIDER_DOWN' } });
  });
});

async function subscribe(socket: Socket, afterSeq?: number): Promise<unknown> {
  return new Promise(resolve => socket.emit('subscribe', { symbol: 'NSE:TEST', interval: '1', ...(afterSeq === undefined ? {} : { afterSeq }) }, resolve));
}

function socketErrorData(error: Error): unknown {
  const value: unknown = error;
  return typeof value === 'object' && value !== null && 'data' in value ? value.data : undefined;
}
