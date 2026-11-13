import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DepthResponse } from '@aitrader/contracts';
import { LiveDepth } from './live-depth';

const book = (at: number): DepthResponse => ({ unavailable: null, depth: { instrumentId: 'NSE:TEST', at, source: 'kite', levels: '5', bids: [], asks: [],
  spread: null, spreadPct: null, totalBidQty: 0, totalAskQty: 0, imbalance: null } });
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
function setup() {
  let current = book(1); const read = vi.fn(() => Promise.resolve(current));
  const emit = vi.fn<(socketId: string, event: string, payload: unknown) => void>();
  const live = new LiveDepth({ resolve: s => Promise.resolve(s === 'NSE:TEST' ? 'NSE:TEST' : null), read }, emit);
  return { live, read, emit, set: (b: DepthResponse) => { current = b; } };
}

describe('LiveDepth', () => {
  it('rejects bad input, an unknown symbol and too many subscriptions', async () => {
    const { live } = setup();
    expect(await live.subscribe('s1', { nope: 1 })).toMatchObject({ ok: false, code: 'INVALID' });
    expect(await live.subscribe('s1', { symbol: 'NSE:NOPE' })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    for (let i = 0; i < 10; i++) expect(await live.subscribe('s1', { symbol: 'NSE:TEST' })).toMatchObject({ ok: true });
    expect(await live.subscribe('s1', { symbol: 'NSE:TEST' })).toMatchObject({ ok: false, code: 'LIMIT' });
    live.disconnect('s1');
  });
  it('sends the first snapshot at once, then only changed books, with seq rising by one', async () => {
    const { live, emit, set } = setup();
    const ack = await live.subscribe('s1', { symbol: 'NSE:TEST' });
    await vi.advanceTimersByTimeAsync(0);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]).toEqual(['s1', 'depth', { subscriptionId: ack.ok ? ack.subscriptionId : '', seq: 1, instrumentId: 'NSE:TEST', response: book(1) }]);
    await vi.advanceTimersByTimeAsync(3000); expect(emit).toHaveBeenCalledTimes(1);
    set(book(2)); await vi.advanceTimersByTimeAsync(1000);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[1]?.[2]).toMatchObject({ seq: 2 });
    live.disconnect('s1');
  });
  it('reads once a second per instrument for any number of sockets, and stops after the last leaves', async () => {
    const { live, read } = setup();
    const a = await live.subscribe('s1', { symbol: 'NSE:TEST' }); await live.subscribe('s2', { symbol: 'NSE:TEST' });
    await vi.advanceTimersByTimeAsync(0); const first = read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000); expect(read.mock.calls.length - first).toBe(2);
    if (a.ok) live.unsubscribe('s1', { subscriptionId: a.subscriptionId });
    live.disconnect('s2');
    const stopped = read.mock.calls.length; await vi.advanceTimersByTimeAsync(5000);
    expect(read.mock.calls.length).toBe(stopped);
  });
});
