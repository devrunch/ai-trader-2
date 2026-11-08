import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsDelayedFeed } from './us-delayed.feed';
import type { MarketDataProvider } from '../../application/ports/market-data-provider';

describe('FR-UI-8 FR-MD-1 US delayed polling', () => {
  const now = Date.parse('2026-11-09T16:00:00Z');
  const bar = { time: now - 16 * 60000, open: 1, high: 2, low: 1, close: 2, volume: 10 };
  let feed: UsDelayedFeed;
  const history = vi.fn<MarketDataProvider['history']>();
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(now); history.mockReset().mockResolvedValue({ ok: true, data: [bar] });
    feed = new UsDelayedFeed({ provider: { name: 'us-delayed', history }, instruments: { getMapping: () => Promise.resolve({ providerSymbol: 'AAPL', volumeType: 'real' }), held: () => Promise.resolve([]) } });
  });
  afterEach(async () => { await feed.stop(); vi.useRealTimers(); });
  it('polls only open US sessions every 60 s', async () => {
    await feed.subscribe(['NASDAQ:AAPL']); await feed.start();
    await vi.advanceTimersByTimeAsync(180000); expect(history).toHaveBeenCalledTimes(3);
    vi.setSystemTime(Date.parse('2026-11-14T16:00:00Z'));
    await vi.advanceTimersByTimeAsync(120000); expect(history).toHaveBeenCalledTimes(3);
  });
  it('emits one tick per new bar and none for repeats', async () => {
    const tick = vi.fn(); feed.onTick(tick); await feed.subscribe(['NASDAQ:AAPL']); await feed.start();
    await vi.advanceTimersByTimeAsync(120000);
    expect(tick).toHaveBeenCalledExactlyOnceWith({ instrumentId: 'NASDAQ:AAPL', at: bar.time + 60000, price: 2, cumVolume: null });
    history.mockResolvedValue({ ok: true, data: [{ ...bar, time: bar.time + 60000 }] });
    await vi.advanceTimersByTimeAsync(60000); expect(tick).toHaveBeenCalledTimes(2);
  });
  it('reports stale after 3 failures and recovers', async () => {
    history.mockResolvedValue({ ok: false, reason: 'PROVIDER_DOWN' }); const state = vi.fn(); feed.onState(state);
    await feed.subscribe(['NASDAQ:AAPL']); await feed.start(); await vi.advanceTimersByTimeAsync(180000);
    expect(state).toHaveBeenLastCalledWith('stale', 'PROVIDER_DOWN');
    history.mockResolvedValue({ ok: true, data: [bar] }); await vi.advanceTimersByTimeAsync(60000);
    expect(state).toHaveBeenLastCalledWith('live', undefined);
  });
  it('exposes delayMs of 15 minutes', () => { expect(feed.delayMs).toBe(900000); expect(feed.name).toBe('us-delayed'); });
  it('rotates at most ten symbols per cycle and staggers requests', async () => {
    await feed.subscribe(Array.from({ length: 12 }, (_, i) => `NASDAQ:T${String(i)}`)); await feed.start();
    await vi.advanceTimersByTimeAsync(60000); expect(history).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(8999); expect(history).toHaveBeenCalledTimes(9);
    await vi.advanceTimersByTimeAsync(1); expect(history).toHaveBeenCalledTimes(10);
    await vi.advanceTimersByTimeAsync(51000); expect(history).toHaveBeenCalledTimes(11);
  });
  it('does not emit unclosed or insufficiently delayed bars', async () => {
    const tick = vi.fn(); feed.onTick(tick); await feed.subscribe(['NASDAQ:AAPL']); await feed.start();
    history.mockResolvedValue({ ok: true, data: [{ ...bar, time: now }, { ...bar, time: now - 60000 }] });
    await vi.advanceTimersByTimeAsync(60000); expect(tick).not.toHaveBeenCalled();
  });
  it('keeps a shared subscription until the final unsubscribe', async () => {
    await feed.subscribe(['NASDAQ:AAPL', 'NASDAQ:AAPL']); await feed.start(); await feed.unsubscribe(['NASDAQ:AAPL']);
    await vi.advanceTimersByTimeAsync(60000); expect(history).toHaveBeenCalledOnce();
    await feed.unsubscribe(['NASDAQ:AAPL']); await vi.advanceTimersByTimeAsync(60000); expect(history).toHaveBeenCalledOnce();
  });
});
