import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveBars } from './live-bars';
import type { Tick, LiveFeed } from './ports/live-feed';
import { historyFixture, historyBar } from './history.spec-helper';
import type { FormingBarStore } from './ports/forming-bar-store';

function fixture() {
  const { store } = historyFixture();
  const forming = { get: vi.fn<FormingBarStore['get']>().mockResolvedValue(null), set: vi.fn<FormingBarStore['set']>().mockResolvedValue(undefined), clear: vi.fn<FormingBarStore['clear']>().mockResolvedValue(undefined) };
  let listener: (tick: Tick) => void = () => {};
  const feed: LiveFeed = { name: 'kite', subscribe: async () => {}, unsubscribe: async () => {}, start: async () => {}, stop: async () => {}, onState: () => () => {}, onTick: cb => { listener = cb; return () => {}; } };
  const bars = new LiveBars(store, forming, { clock: Date.now, log: vi.fn() }); const detach = bars.attach(feed);
  const tick = (offset: number, price = 10, seq?: number) => { listener({ instrumentId: 'NSE:TEST', at: historyBar.time + offset, price, cumVolume: 100 + offset, ...(seq === undefined ? {} : { seq }) }); };
  return { store, forming, tick, detach };
}
describe('FR-MD-2 E16 LiveBars', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(historyBar.time); });
  afterEach(() => { vi.useRealTimers(); });
  it('persists closed bars and keeps the forming bar in Redis', async () => {
    const f = fixture(); f.tick(0); await vi.advanceTimersByTimeAsync(0); f.tick(60000, 12); await vi.advanceTimersByTimeAsync(250);
    expect(f.store.upsert1m).toHaveBeenCalledWith('NSE:TEST', [expect.objectContaining({ time: historyBar.time, close: 10 })], 'kite-live');
    expect(f.forming.set.mock.calls.at(-1)?.[1].bar).toMatchObject({ time: historyBar.time + 60000, close: 12 }); f.detach();
  });
  it('restores the forming bar after restart', async () => {
    const f = fixture(); f.forming.get.mockResolvedValue({ bar: historyBar, lastCumVolume: 100, seq: null }); f.tick(1000, 15); await vi.advanceTimersByTimeAsync(0);
    expect(f.forming.get).toHaveBeenCalledOnce(); expect(f.forming.set).toHaveBeenCalledWith('NSE:TEST', expect.objectContaining({ bar: { ...historyBar, high: 15, close: 15, volume: 1004 } })); f.detach();
  });
  it('closeDue sweep closes bars without new ticks', async () => {
    const f = fixture(); f.tick(0); await vi.advanceTimersByTimeAsync(60000);
    expect(f.store.upsert1m).toHaveBeenCalledWith('NSE:TEST', [expect.objectContaining({ time: historyBar.time })], 'kite-live'); expect(f.forming.clear).toHaveBeenCalled(); f.detach();
  });
  it('throttles forming-bar writes', async () => {
    const f = fixture(); f.tick(0); await vi.advanceTimersByTimeAsync(0);
    for (let i = 1; i <= 20; i++) f.tick(i, i);
    await vi.advanceTimersByTimeAsync(249); expect(f.forming.set).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(f.forming.set).toHaveBeenCalledTimes(2);
    expect(f.forming.set.mock.calls.at(-1)?.[1].bar.close).toBe(20); f.detach();
  });
  it('rejects duplicate sequence numbers restored from Redis (E11 E16)', async () => {
    const f = fixture(); f.forming.get.mockResolvedValue({ bar: historyBar, lastCumVolume: 100, seq: 5 });
    f.tick(1000, 99, 5); f.tick(2000, 11, 6); await vi.advanceTimersByTimeAsync(0);
    expect(f.forming.set.mock.calls.at(-1)?.[1].bar).toEqual({ ...historyBar, volume: 2004 }); f.detach();
  });
  it('puts a boundary tick in the next minute and applies a late tick to the previous minute (E11 E12)', async () => {
    const f = fixture(); f.tick(0); f.tick(60000, 20); f.tick(59999, 15); await vi.advanceTimersByTimeAsync(250);
    expect(f.store.upsert1m.mock.calls.at(-1)?.[1][0]).toMatchObject({ time: historyBar.time, open: 10, close: 15 });
    expect(f.forming.set.mock.calls.at(-1)?.[1].bar).toMatchObject({ time: historyBar.time + 60000, open: 20, close: 20 }); f.detach();
    expect(f.forming.set.mock.calls.at(-1)?.[1].lastCumVolume).toBe(60100);
  });
});
