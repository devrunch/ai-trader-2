import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResilientFeed, type FeedTransport } from './resilient-feed';
import type { Tick } from '../../application/ports/live-feed';

class Socket implements FeedTransport {
  connect = vi.fn<FeedTransport['connect']>().mockResolvedValue(undefined);
  close = vi.fn(() => { this.closed('drop'); });
  sendSubscribe = vi.fn();
  sendUnsubscribe = vi.fn();
  ticks: (ticks: Tick[]) => void = () => {};
  closed: (reason: string) => void = () => {};
  onMessage(cb: (ticks: Tick[]) => void) { this.ticks = cb; }
  onClose(cb: (reason: string) => void) { this.closed = cb; }
}
function fixture(open = true, configure: (socket: Socket, index: number) => void = () => {}) {
  const sockets: Socket[] = [];
  const deps = { clock: Date.now, isOpen: vi.fn(() => open), backfill: vi.fn().mockResolvedValue(undefined),
    resolveKey: (id: string) => id, backoff: { baseMs: 500, maxMs: 30000, random: () => 0.5 },
    refreshAuth: vi.fn().mockResolvedValue(undefined), log: vi.fn() };
  const feed = new ResilientFeed('kite', () => { const socket = new Socket(); configure(socket, sockets.length); sockets.push(socket); return socket; }, deps);
  return { feed, sockets, deps };
}
describe('E1 E2 E3 FR-MD-5 NFR-RB-1 ResilientFeed', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100000); });
  afterEach(() => { vi.useRealTimers(); });
  it('reconnects with backoff and resubscribes everything', async () => {
    const { feed, sockets } = fixture(); await feed.subscribe(['NSE:A', 'NSE:B']); await feed.start();
    sockets[0]?.closed('drop'); await vi.advanceTimersByTimeAsync(249); expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); expect(sockets[1]?.sendSubscribe).toHaveBeenCalledWith(['NSE:A', 'NSE:B']); await feed.stop();
  });
  it('backfills the outage window for open markets after reconnect', async () => {
    const { feed, sockets, deps } = fixture(); await feed.subscribe(['NSE:A']); await feed.start();
    sockets[0]?.ticks([{ instrumentId: 'NSE:A', at: 99999, price: 1, cumVolume: 1 }]); sockets[0]?.closed('drop');
    await vi.advanceTimersByTimeAsync(250); expect(deps.backfill).toHaveBeenCalledWith('NSE:A', 99999, 100250, expect.any(AbortSignal)); await feed.stop();
  });
  it('watchdog treats 30 s of silence during market hours as a drop', async () => {
    const { feed, sockets } = fixture(); await feed.subscribe(['NSE:A']); await feed.start();
    await vi.advanceTimersByTimeAsync(30000); expect(sockets[0]?.close).toHaveBeenCalledOnce(); await feed.stop();
  });
  it('watchdog sleeps when all subscribed markets are closed', async () => {
    const { feed, sockets } = fixture(false); await feed.subscribe(['NSE:A']); await feed.start();
    await vi.advanceTimersByTimeAsync(120000); expect(sockets[0]?.close).not.toHaveBeenCalled(); await feed.stop();
  });
  it('unsubscribe waits 60 s grace and resubscribe cancels it', async () => {
    const { feed, sockets } = fixture(false); await feed.subscribe(['NSE:A']); await feed.start(); await feed.unsubscribe(['NSE:A']);
    await vi.advanceTimersByTimeAsync(59999); expect(sockets[0]?.sendUnsubscribe).not.toHaveBeenCalled();
    await feed.subscribe(['NSE:A']); await vi.advanceTimersByTimeAsync(1); expect(sockets[0]?.sendUnsubscribe).not.toHaveBeenCalled();
    await feed.unsubscribe(['NSE:A']); await vi.advanceTimersByTimeAsync(60000); expect(sockets[0]?.sendUnsubscribe).toHaveBeenCalledWith(['NSE:A']); await feed.stop();
  });
  it('auth failure sets stale with reason and re-mints once per cycle', async () => {
    const { feed, sockets, deps } = fixture(true, (socket, index) => { if (index === 0) socket.connect.mockRejectedValue(new Error('AUTH_EXPIRED')); });
    const states = vi.fn(); feed.onState(states); const started = feed.start();
    await vi.advanceTimersByTimeAsync(0); expect(states).toHaveBeenCalledWith('stale', 'AUTH_EXPIRED');
    expect(deps.refreshAuth).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(250); await started;
    expect(deps.refreshAuth).toHaveBeenCalledOnce(); sockets[1]?.closed('AUTH_EXPIRED');
    await vi.advanceTimersByTimeAsync(500); expect(deps.refreshAuth).toHaveBeenCalledTimes(2); await feed.stop();
  });
  it('resets backoff after 60 s live', async () => {
    const { feed, sockets } = fixture(false); await feed.start(); sockets[0]?.closed('drop'); await vi.advanceTimersByTimeAsync(250);
    sockets[1]?.closed('drop'); await vi.advanceTimersByTimeAsync(500); await vi.advanceTimersByTimeAsync(60000);
    sockets[2]?.closed('drop'); await vi.advanceTimersByTimeAsync(250); expect(sockets).toHaveLength(4); await feed.stop();
  });
  it('keeps live ticks flowing when repair fails and retries the window on the nightly run', async () => {
    const { feed, sockets, deps } = fixture(); const ticks = vi.fn(); feed.onTick(ticks);
    deps.backfill.mockRejectedValueOnce(new Error('history down'));
    await feed.subscribe(['NSE:A']); await feed.start(); sockets[0]?.closed('drop');
    await vi.advanceTimersByTimeAsync(250);
    sockets[1]?.ticks([{ instrumentId: 'NSE:A', at: 100251, price: 9, cumVolume: null }]);
    expect(ticks).toHaveBeenCalledOnce(); expect(deps.log).toHaveBeenCalledWith('backfill failed: NSE:A; queued for nightly retry', expect.any(Error));
    await feed.retryBackfills(new AbortController().signal);
    expect(deps.backfill).toHaveBeenCalledTimes(2); await feed.retryBackfills(new AbortController().signal);
    expect(deps.backfill).toHaveBeenCalledTimes(2); await feed.stop();
  });
  it('backfills markets that opened and closed inside the outage', async () => {
    const { feed, sockets, deps } = fixture(false);
    deps.isOpen.mockImplementation((_id?: string, at?: number) => at === 160000);
    await feed.subscribe(['NSE:A']); await feed.start(); sockets[0]?.closed('drop');
    await vi.advanceTimersByTimeAsync(0); vi.setSystemTime(220000); await vi.advanceTimersByTimeAsync(250);
    expect(deps.backfill).toHaveBeenCalledWith('NSE:A', 100000, 220250, expect.any(AbortSignal)); await feed.stop();
  });
  it('cancels a pending connection and stops without reconnecting', async () => {
    const { feed, sockets } = fixture(true, socket => { socket.connect.mockImplementation(() => new Promise(() => {})); });
    const started = feed.start(); await feed.stop(); await started;
    await vi.advanceTimersByTimeAsync(120000); expect(sockets).toHaveLength(1);
  });
  it('keeps a shared subscription until all references have left', async () => {
    const { feed, sockets } = fixture(false); await feed.subscribe(['NSE:A']); await feed.subscribe(['NSE:A']); await feed.start();
    await feed.unsubscribe(['NSE:A']); await vi.advanceTimersByTimeAsync(60000);
    expect(sockets[0]?.sendUnsubscribe).not.toHaveBeenCalled(); await feed.unsubscribe(['NSE:A']);
    await vi.advanceTimersByTimeAsync(60000); expect(sockets[0]?.sendUnsubscribe).toHaveBeenCalledOnce(); await feed.stop();
  });
});
