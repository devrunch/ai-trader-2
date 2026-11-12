import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BarUpdate } from '@aitrader/contracts';
import { LiveSubscriptions } from './live-subscriptions';
import type { LiveChange, LiveData, LiveBar } from './ports/live-data';
import { AggregateLiveBars } from '../../market-data/application/index';

const start = Date.UTC(2026, 10, 9, 3, 45);
function bar(time: number, close = 10, high = 10): LiveBar { return { time, open: 10, high, low: 9, close, volume: 1 }; }
function update(seq: number, time = start, close = 10, high = 10): BarUpdate { return { instrumentId: 'NSE:TEST', seq, kind: 'forming', bar: bar(time, close, high), at: time }; }

function harness(options: { seq?: number; replay?: BarUpdate[] | null; read?: (interval: string, limit: number) => LiveBar[]; emit?: (event: string, payload: unknown) => boolean } = {}) {
  const listeners = new Set<(change: LiveChange) => void>();
  const secondListeners = new Set<(kind: 'forming' | 'closed', bar: LiveBar) => void>();
  const release = vi.fn().mockResolvedValue(undefined);
  const acquireSeconds = vi.fn().mockResolvedValue(undefined);
  const releaseSeconds = vi.fn().mockResolvedValue(undefined);
  const events: Array<{ event: string; payload: unknown }> = [];
  const data: LiveData = {
    resolve: () => Promise.resolve('NSE:TEST'),
    read: (_id, interval, limit) => Promise.resolve({ bars: options.read?.(interval, limit) ?? [], status: { state: 'ok' } }),
    current: () => Promise.resolve(options.seq ?? 0),
    replay: () => Promise.resolve(options.replay === undefined ? [] : options.replay),
    watch: (_id, listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    acquire: vi.fn().mockResolvedValue(undefined), release,
    acquireSeconds, releaseSeconds,
    watchSeconds: (_id, _interval, listener) => { secondListeners.add(listener); return () => { secondListeners.delete(listener); }; },
    aggregate: (bars, interval, id) => new AggregateLiveBars().execute(bars, interval, id),
  };
  const service = new LiveSubscriptions(data);
  const send = options.emit ?? ((event: string, payload: unknown) => { events.push({ event, payload }); return true; });
  service.connect('socket-1', 'user-1', send);
  return { service, data, release, acquireSeconds, releaseSeconds, events, listeners, secondListeners, send, fire: (change: LiveChange) => { for (const listener of listeners) listener(change); } };
}

describe('LiveSubscriptions (FR-LS-1, FR-LS-2, E10, E11, E16, E24, NFR-RB-1)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('snapshot then buffered updates have no gap and no duplicate', async () => {
    const h = harness({ seq: 10 });
    h.data.read = () => {
      h.fire({ type: 'bar', update: update(11) }); h.fire({ type: 'bar', update: update(11) }); h.fire({ type: 'bar', update: update(12) });
      return Promise.resolve({ bars: [], status: { state: 'ok' } });
    };
    const ack = await h.service.subscribe('socket-1', { symbol: 'NSE:TEST', interval: '1' });
    expect(ack.ok).toBe(true);
    expect(h.events.map(event => event.event)).toEqual(['snapshot', 'bar', 'bar']);
    expect(h.events.slice(1).map(event => (event.payload as { seq: number }).seq)).toEqual([11, 12]);
  });

  it('5m interval updates aggregate on the session grid', async () => {
    const seed = [bar(start, 10, 11), bar(start + 60_000, 11, 12), bar(start + 120_000, 12, 13)];
    const h = harness({ read: (_interval, limit) => limit === 5000 ? seed : [] });
    await h.service.subscribe('socket-1', { symbol: 'NSE:TEST', interval: '5' });
    h.fire({ type: 'bar', update: update(1, start + 180_000, 14, 15) });
    const emitted = h.events.find(event => event.event === 'bar')?.payload as { bar: LiveBar } | undefined;
    expect(emitted?.bar).toMatchObject({ time: start, open: 10, high: 15, low: 9, close: 14, volume: 4 });
  });

  it('second intervals snapshot from the ring, then number their own bars and ignore minute updates (FR-CH-8)', async () => {
    const h = harness({ seq: 7, read: interval => interval === '5S' ? [bar(start, 10)] : [] });
    const ack = await h.service.subscribe('socket-1', { symbol: 'NSE:TEST', interval: '5S', afterSeq: 3 });
    expect(ack.ok).toBe(true);
    expect(h.acquireSeconds).toHaveBeenCalledWith('NSE:TEST', '5S');
    expect(h.events[0]).toMatchObject({ event: 'snapshot', payload: { interval: '5S', seq: 0, bars: [bar(start, 10)] } });
    h.fire({ type: 'bar', update: update(8) });
    for (const listener of h.secondListeners) { listener('forming', bar(start + 5000, 11)); listener('closed', bar(start + 5000, 12)); }
    expect(h.events.slice(1).map(event => event.event)).toEqual(['bar', 'bar']);
    expect(h.events.slice(1).map(event => (event.payload as { seq: number }).seq)).toEqual([1, 2]);
  });

  it('releasing a seconds subscription releases its seconds lease (FR-CH-8)', async () => {
    const h = harness();
    const ack = await h.service.subscribe('socket-1', { symbol: 'NSE:TEST', interval: '1S' });
    if (!ack.ok) throw new Error('subscribe failed');
    await h.service.unsubscribe('socket-1', { subscriptionId: ack.subscriptionId });
    expect(h.releaseSeconds).toHaveBeenCalledWith('NSE:TEST', '1S');
    expect(h.secondListeners.size).toBe(0);
  });

  it('seq gap emits resync', async () => {
    const h = harness({ seq: 1 });
    await h.service.subscribe('socket-1', { symbol: 'NSE:TEST', interval: '1' });
    h.fire({ type: 'bar', update: update(3) });
    expect(h.events.at(-1)).toMatchObject({ event: 'resync', payload: { reason: 'SEQ_GAP' } });
  });

  it('resync removes the subscription so repeated gaps never leak watches, leases or the limit', async () => {
    const h = harness({ seq: 1 });
    for (let round = 0; round < 3; round++) {
      await h.service.subscribe('socket-1', { symbol: 'NSE:TEST', interval: '1' });
      h.fire({ type: 'bar', update: update(100 * (round + 1)) });
      await Promise.resolve();
    }
    expect(h.listeners.size).toBe(0);
    expect(h.release).toHaveBeenCalledTimes(3);
    h.fire({ type: 'bar', update: update(1000) });
    expect(h.events.filter(event => event.event === 'resync')).toHaveLength(3);
  });

  it('upstream subscriber reconnect emits resync', async () => {
    const h = harness({ seq: 1 });
    await h.service.subscribe('socket-1', { symbol: 'NSE:TEST', interval: '1' });
    h.service.upstreamReconnect();
    expect(h.events.at(-1)).toMatchObject({ event: 'resync', payload: { reason: 'UPSTREAM_RECONNECT' } });
  });

  it('afterSeq replays from history or falls back to snapshot', async () => {
    const replaying = harness({ replay: [update(2)] });
    await replaying.service.subscribe('socket-1', { symbol: 'NSE:TEST', interval: '1', afterSeq: 1 });
    expect(replaying.events.map(event => event.event)).toEqual(['bar']);
    const resyncing = harness({ replay: null });
    await resyncing.service.subscribe('socket-1', { symbol: 'NSE:TEST', interval: '1', afterSeq: 1 });
    expect(resyncing.events.map(event => event.event)).toEqual(['snapshot']);
  });

  it('slow consumer gets resync instead of unbounded buffering', async () => {
    const h = harness({ seq: 1, emit: (event, payload) => { if (event === 'bar' || event === 'resync') h.events.push({ event, payload }); return event !== 'bar'; } });
    await h.service.subscribe('socket-1', { symbol: 'NSE:TEST', interval: '1' });
    h.fire({ type: 'bar', update: update(2) }); h.fire({ type: 'bar', update: update(3) });
    expect(h.events.map(event => event.event)).toEqual(['bar', 'resync']);
    expect(h.events.at(-1)?.payload).toMatchObject({ reason: 'SLOW_CONSUMER' });
  });

  it('limits and rate limit return ack errors', async () => {
    const now = 0;
    const data = harness().data;
    const service = new LiveSubscriptions(data, () => now);
    service.connect('socket-1', 'user-1', () => true);
    let result = await service.subscribe('socket-1', { symbol: 'NSE:TEST', interval: '1' });
    for (let index = 0; index < 19; index++) result = await service.subscribe('socket-1', { symbol: 'NSE:TEST', interval: '1' });
    expect(result.ok).toBe(true);
    result = await service.subscribe('socket-1', { symbol: 'NSE:TEST', interval: '1' });
    expect(result).toMatchObject({ ok: false, code: 'LIMIT' });
    let socketNow = 0;
    const cap = new LiveSubscriptions(data, () => socketNow);
    expect(cap.connect('socket-a', 'user-a', () => true)).toBe(true);
    for (let index = 1; index <= 50; index++) { socketNow += 500; expect((await cap.subscribe('socket-a', { symbol: 'NSE:TEST', interval: '1' })).ok).toBe(index <= 50); }
    socketNow += 500;
    expect(await cap.subscribe('socket-a', { symbol: 'NSE:TEST', interval: '1' })).toMatchObject({ ok: false, code: 'LIMIT' });
    const notFound = new LiveSubscriptions({ ...data, resolve: () => Promise.resolve(null) }, () => 0);
    notFound.connect('socket-b', 'user-b', () => true);
    expect(await notFound.subscribe('socket-b', { symbol: 'NSE:NOPE', interval: '1' })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    for (let index = 0; index < 10; index++) expect(service.connect(`socket-${String(index + 2)}`, 'crowded', () => true)).toBe(true);
    expect(service.connect('socket-12', 'crowded', () => true)).toBe(false);
  });
});
