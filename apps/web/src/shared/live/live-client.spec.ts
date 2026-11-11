import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bar, DataStatus } from '@aitrader/contracts';
import { LiveClient, type SocketLike } from './live-client';
import { connectionStore } from './connection-store';

const SUB_A = '00000000-0000-4000-8000-00000000000a';
const SUB_B = '00000000-0000-4000-8000-00000000000b';
const t0 = Date.UTC(2026, 10, 9, 3, 45);
const bar = (minute: number, close = 10): Bar => ({ time: t0 + minute * 60_000, open: 10, high: Math.max(10, close), low: 9, close, volume: 1 });
const ok: DataStatus = { state: 'ok' };

type Handler = (...args: unknown[]) => void;
class FakeSocket implements SocketLike {
  connected = false;
  connects = 0;
  readonly sent: Array<{ event: string; payload: unknown; ack?: Handler }> = [];
  private readonly handlers = new Map<string, Set<Handler>>();
  on(event: string, fn: Handler): void { const set = this.handlers.get(event) ?? new Set(); set.add(fn); this.handlers.set(event, set); }
  emit(event: string, ...args: unknown[]): void {
    const last = args.at(-1);
    const ack = typeof last === 'function' ? (args.pop() as Handler) : undefined;
    this.sent.push({ event, payload: args[0], ...(ack ? { ack } : {}) });
  }
  connect(): void { this.connects++; }
  disconnect(): void { this.connected = false; }
  fire(event: string, ...args: unknown[]): void { for (const fn of this.handlers.get(event) ?? []) fn(...args); }
  open(): void { this.connected = true; this.fire('connect'); }
  drop(): void { this.connected = false; this.fire('disconnect', 'transport close'); }
  subscribes() { return this.sent.filter(item => item.event === 'subscribe'); }
  ack(index: number, response: unknown): void { this.subscribes()[index]?.ack?.(response); }
}

function handlers() {
  return { onReset: vi.fn<(bars: Bar[]) => void>(), onUpdate: vi.fn<(bar: Bar) => void>(), onStatus: vi.fn<(status: DataStatus) => void>() };
}

function setup() {
  const socket = new FakeSocket();
  const store = { set: vi.fn<(key: string, value: number) => void>() };
  const doc: EventTarget & { visibilityState: DocumentVisibilityState } = Object.assign(new EventTarget(), { visibilityState: 'visible' as const });
  const win = Object.assign(new EventTarget(), { navigator: { onLine: true } });
  const client = new LiveClient({ socket, store, doc, win, random: () => 1 });
  client.start();
  socket.open();
  return { socket, store, doc, win, client };
}

function snapshot(socket: FakeSocket, id: string, seq: number, bars: Bar[] = [bar(0)]) {
  socket.fire('snapshot', { subscriptionId: id, instrumentId: 'NSE:A', interval: '1', bars, seq, status: ok });
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(t0); });
afterEach(() => { vi.useRealTimers(); });

describe('LiveClient (FR-LS-3/4, E7–E11, E14, FR-UI-8)', () => {
  it('reconnects with jittered backoff and resubscribes with afterSeq', async () => {
    const { socket, client } = setup();
    const h = handlers();
    client.subscribe('NSE:A', '1', h);
    socket.ack(0, { ok: true, subscriptionId: SUB_A });
    snapshot(socket, SUB_A, 5);
    socket.fire('bar', { subscriptionId: SUB_A, seq: 6, kind: 'forming', bar: bar(0, 11) });
    socket.drop();
    expect(connectionStore.getState().connection).toMatchObject({ state: 'reconnecting', attempt: 0 });
    vi.advanceTimersByTime(499);
    expect(socket.connects).toBe(1);
    vi.advanceTimersByTime(1);
    expect(socket.connects).toBe(2);
    socket.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(connectionStore.getState().connection).toEqual({ state: 'live' });
    expect(socket.subscribes()).toHaveLength(2);
    expect(socket.subscribes().at(-1)?.payload).toEqual({ symbol: 'NSE:A', interval: '1', afterSeq: 6 });
  });

  it('two charts on the same symbol share one subscription', () => {
    const { socket, client } = setup();
    const first = handlers(); const second = handlers();
    const offFirst = client.subscribe('NSE:A', '1', first);
    const offSecond = client.subscribe('NSE:A', '1', second);
    expect(socket.subscribes()).toHaveLength(1);
    socket.ack(0, { ok: true, subscriptionId: SUB_A });
    snapshot(socket, SUB_A, 1);
    expect(first.onReset).toHaveBeenCalledWith([bar(0)]);
    expect(second.onReset).toHaveBeenCalledWith([bar(0)]);
    offFirst();
    expect(socket.sent.filter(item => item.event === 'unsubscribe')).toHaveLength(0);
    offSecond();
    expect(socket.sent.filter(item => item.event === 'unsubscribe').map(item => item.payload)).toEqual([{ subscriptionId: SUB_A }]);
  });

  it('a snapshot that arrives before the ack is applied', () => {
    const { socket, client } = setup();
    const h = handlers();
    client.subscribe('NSE:A', '1', h);
    snapshot(socket, SUB_A, 3);
    socket.ack(0, { ok: true, subscriptionId: SUB_A });
    expect(h.onReset).toHaveBeenCalledWith([bar(0)]);
    expect(h.onStatus).toHaveBeenCalledWith(ok);
  });

  it('gap triggers exactly one resubscribe', async () => {
    const { socket, client } = setup();
    client.subscribe('NSE:A', '1', handlers());
    socket.ack(0, { ok: true, subscriptionId: SUB_A });
    snapshot(socket, SUB_A, 5);
    socket.fire('bar', { subscriptionId: SUB_A, seq: 8, kind: 'forming', bar: bar(1) });
    socket.fire('bar', { subscriptionId: SUB_A, seq: 9, kind: 'forming', bar: bar(1) });
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.subscribes()).toHaveLength(2);
    expect(socket.subscribes()[1]?.payload).toEqual({ symbol: 'NSE:A', interval: '1', afterSeq: 5 });
  });

  it('server resync resubscribes with afterSeq', async () => {
    const { socket, client } = setup();
    client.subscribe('NSE:A', '1', handlers());
    socket.ack(0, { ok: true, subscriptionId: SUB_A });
    snapshot(socket, SUB_A, 5);
    socket.fire('resync', { subscriptionId: SUB_A, reason: 'SEQ_GAP' });
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.subscribes()[1]?.payload).toEqual({ symbol: 'NSE:A', interval: '1', afterSeq: 5 });
    socket.ack(1, { ok: true, subscriptionId: SUB_B });
    socket.fire('bar', { subscriptionId: SUB_B, seq: 6, kind: 'forming', bar: bar(0, 12) });
  });

  it('hidden then visible tab resyncs', async () => {
    const { socket, client, doc } = setup();
    client.subscribe('NSE:A', '1', handlers());
    socket.ack(0, { ok: true, subscriptionId: SUB_A });
    snapshot(socket, SUB_A, 5);
    doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(2_000);
    doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.subscribes()).toHaveLength(1);
    doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(6_000);
    doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.subscribes()).toHaveLength(2);
  });

  it('sleep detection resyncs after wake', async () => {
    const { socket, client } = setup();
    client.subscribe('NSE:A', '1', handlers());
    socket.ack(0, { ok: true, subscriptionId: SUB_A });
    snapshot(socket, SUB_A, 5);
    vi.setSystemTime(Date.now() + 20 * 60_000); // the laptop slept; timers did not run
    await vi.advanceTimersByTimeAsync(15_000);
    expect(socket.subscribes()).toHaveLength(2);
  });

  it('offline then online resyncs once', async () => {
    const { socket, client, win } = setup();
    client.subscribe('NSE:A', '1', handlers());
    socket.ack(0, { ok: true, subscriptionId: SUB_A });
    snapshot(socket, SUB_A, 5);
    win.navigator.onLine = false; win.dispatchEvent(new Event('offline'));
    expect(connectionStore.getState().connection).toEqual({ state: 'offline' });
    win.navigator.onLine = true; win.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.subscribes()).toHaveLength(2);
  });

  it('unauthorized stops retrying and sets unauthorized', () => {
    const { socket } = setup();
    socket.drop();
    socket.fire('connect_error', Object.assign(new Error('Unauthorized'), { data: { code: 'UNAUTHORIZED' } }));
    vi.advanceTimersByTime(60_000);
    expect(connectionStore.getState().connection).toEqual({ state: 'unauthorized' });
    expect(socket.connects).toBe(1);
  });

  it('stale guard resubscribes once after 90s of silence', async () => {
    const { socket, client } = setup();
    client.subscribe('NSE:A', '1', handlers());
    socket.ack(0, { ok: true, subscriptionId: SUB_A });
    snapshot(socket, SUB_A, 5);
    await vi.advanceTimersByTimeAsync(105_000);
    expect(socket.subscribes()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(socket.subscribes()).toHaveLength(2);
  });

  it('price is written to LiveStore and not React state', () => {
    const { socket, client, store } = setup();
    client.subscribe('NSE:A', '1', handlers());
    socket.ack(0, { ok: true, subscriptionId: SUB_A });
    snapshot(socket, SUB_A, 5, [bar(0, 10)]);
    socket.fire('bar', { subscriptionId: SUB_A, seq: 6, kind: 'forming', bar: bar(0, 12.5) });
    expect(store.set).toHaveBeenLastCalledWith('price:NSE:A', 12.5);
  });

  it('older history merges into the shared series and reaches every chart', () => {
    const { socket, client } = setup();
    const h = handlers();
    client.subscribe('NSE:A', '1', h);
    socket.ack(0, { ok: true, subscriptionId: SUB_A });
    snapshot(socket, SUB_A, 5, [bar(10), bar(11)]);
    client.mergeHistory('NSE:A', '1', [bar(8), bar(9)]);
    expect(h.onReset).toHaveBeenLastCalledWith([bar(8), bar(9), bar(10), bar(11)]);
    client.mergeHistory('NSE:B', '1', [bar(1)]);
  });

  it('live indicators ride on the bar subscription and are sent again after every resubscribe (FR-IN-5)', async () => {
    const { socket, client } = setup();
    client.subscribe('NSE:A', '1', handlers());
    const ind = { onReset: vi.fn(), onUpdate: vi.fn(), onError: vi.fn() };
    const stop = client.watchIndicator('NSE:A', '1', 'k', { kind: 'builtin', id: 'sma', inputs: {} }, ind);
    expect(socket.sent.filter(s => s.event === 'subscribeIndicators')).toHaveLength(0); // no server subscription yet
    socket.ack(0, { ok: true, subscriptionId: SUB_A });
    const first = socket.sent.filter(s => s.event === 'subscribeIndicators');
    expect(first.map(s => s.payload)).toEqual([{ subscriptionId: SUB_A, indicators: [{ instanceId: 'k', indicator: { kind: 'builtin', id: 'sma', inputs: {} } }] }]);
    const result = { instrumentId: 'NSE:A', resolvedId: 'NSE:A', interval: '1', ref: 'builtin:sma@1', inputs: {}, times: [t0], plots: [{ id: 'ma', values: [1] }], status: ok };
    first[0]?.ack?.({ ok: true, results: [{ instanceId: 'k', result }] });
    expect(ind.onReset).toHaveBeenCalledWith(result);
    socket.fire('indicator', { subscriptionId: SUB_A, instanceId: 'k', barTime: t0, values: { ma: 2 }, seq: 3 });
    expect(ind.onUpdate).toHaveBeenCalledWith(expect.objectContaining({ barTime: t0, values: { ma: 2 } }));
    socket.fire('resync', { subscriptionId: SUB_A, reason: 'SEQ_GAP' });
    await vi.advanceTimersByTimeAsync(0);
    socket.ack(1, { ok: true, subscriptionId: SUB_B });
    expect(socket.sent.filter(s => s.event === 'subscribeIndicators').at(-1)?.payload).toMatchObject({ subscriptionId: SUB_B });
    stop();
    expect(socket.sent.at(-1)).toMatchObject({ event: 'unsubscribeIndicators', payload: { subscriptionId: SUB_B, instanceIds: ['k'] } });
  });
});
