import { describe, expect, it, vi } from 'vitest';
import type { Depth } from '@aitrader/contracts';
import type { FeedStateRecord } from './ports/feed-state-store';
import { ReadDepth } from './read-depth';

const depth: Depth = { instrumentId: 'NSE:TEST', at: 1, source: 'kite', levels: '5', bids: [], asks: [], spread: null, spreadPct: null, totalBidQty: 0, totalAskQty: 0, imbalance: null };
const OPEN = Date.parse('2026-11-09T05:00:00Z'); // Monday 10:30 IST
const CLOSED = Date.parse('2026-11-08T05:00:00Z'); // Sunday
function setup(stored: Depth | null, feed: FeedStateRecord = { state: 'live', at: 0 }, at = OPEN) {
  const subscriptions = { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) };
  const store = { get: vi.fn().mockResolvedValue(stored), set: vi.fn() };
  return { subscriptions, store, read: new ReadDepth(store, { get: () => Promise.resolve(feed) }, subscriptions, () => at) };
}

describe('ReadDepth', () => {
  it('returns the stored book and asks for the feed', async () => {
    const { read, subscriptions } = setup(depth);
    expect(await read.execute('NSE:TEST')).toEqual({ depth, unavailable: null });
    expect(subscriptions.acquire).toHaveBeenCalledWith('NSE:TEST');
  });
  it('acquires once for repeated reads and releases a minute after the last', async () => {
    vi.useFakeTimers();
    const { read, subscriptions } = setup(depth);
    await read.execute('NSE:TEST'); await vi.advanceTimersByTimeAsync(30_000); await read.execute('NSE:TEST');
    expect(subscriptions.acquire).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(59_000); expect(subscriptions.release).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000); expect(subscriptions.release).toHaveBeenCalledWith('NSE:TEST');
    vi.useRealTimers();
  });
  it('says there is no order book for US instruments, and does not subscribe', async () => {
    const { read, subscriptions } = setup(depth);
    expect(await read.execute('NASDAQ:AAPL')).toEqual({ depth: null, unavailable: 'No order book for this instrument' });
    expect(subscriptions.acquire).not.toHaveBeenCalled();
  });
  it('says the market is closed when there is no book outside the session', async () => {
    expect(await setup(null, { state: 'live', at: 0 }, CLOSED).read.execute('NSE:TEST')).toEqual({ depth: null, unavailable: 'Market closed' });
  });
  it('says not subscribed yet when the feed is live but has no book', async () => {
    expect(await setup(null).read.execute('NSE:TEST')).toEqual({ depth: null, unavailable: 'Not subscribed yet' });
  });
  it('says feed down when the feed is not live', async () => {
    expect(await setup(null, { state: 'reconnecting', at: 0 }).read.execute('NSE:TEST')).toEqual({ depth: null, unavailable: 'Feed down' });
    expect(await setup(null, { state: 'unknown' }).read.execute('NSE:TEST')).toEqual({ depth: null, unavailable: 'Feed down' });
  });
  it('reports the store being down as unavailable instead of throwing', async () => {
    const { read, store } = setup(null); store.get.mockRejectedValue(new Error('redis'));
    expect(await read.execute('NSE:TEST')).toEqual({ depth: null, unavailable: 'Order book temporarily unavailable' });
  });
});
