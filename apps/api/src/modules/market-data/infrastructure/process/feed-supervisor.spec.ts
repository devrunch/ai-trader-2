import { describe, expect, it, vi } from 'vitest';
import { FeedSupervisor } from './feed-supervisor';
import { isDerivWatchdogQuietWindow } from '../deriv/deriv.feed';
import type { LiveFeed, FeedState, Tick } from '../../application/ports/live-feed';

describe('FeedSupervisor (FR-MD-5, NFR-RB-7, E16)', () => {
  function feed(name: LiveFeed['name']) {
    const states = new Set<(state: FeedState, reason?: string) => void>();
    const listeners = new Set<(tick: Tick) => void>();
    const calls = { subscribe: vi.fn(() => Promise.resolve()), unsubscribe: vi.fn(() => Promise.resolve()),
      start: vi.fn(() => { for (const listener of states) listener('connecting'); return Promise.resolve(); }), stop: vi.fn(() => Promise.resolve()) };
    const value: LiveFeed = { name, ...calls,
      onState: listener => { states.add(listener); return () => { states.delete(listener); }; },
      onTick: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
    return { value, calls, emit: (state: FeedState, reason?: string) => { for (const listener of states) listener(state, reason); } };
  }
  function harness(feeds: LiveFeed[], held: readonly string[] = [], current = new Map<string, number>()) {
    let onChange: (id: string, count: number) => void = () => {};
    const publish = vi.fn(() => Promise.resolve()); const closeDue = vi.fn(() => Promise.resolve());
    const bars = { attach: vi.fn(() => vi.fn()), closeDue };
    const requests = { current: () => Promise.resolve(current), onChange: (callback: typeof onChange) => { onChange = callback; return () => {}; } };
    const supervisor = new FeedSupervisor({ feeds, liveBars: bars, publisher: { publish }, requests, held: () => Promise.resolve(held) });
    return { supervisor, publish, closeDue, requestChange: (id: string, count: number) => { onChange(id, count); } };
  }
  it('starts feeds and publishes each state change', async () => {
    const kite = feed('kite'); const h = harness([kite.value]); await h.supervisor.start();
    kite.emit('stale', 'AUTH_EXPIRED');
    expect(kite.calls.start.mock.calls).toHaveLength(1);
    expect(h.publish).toHaveBeenCalledWith('kite', 'connecting', undefined);
    expect(h.publish).toHaveBeenCalledWith('kite', 'stale', 'AUTH_EXPIRED'); await h.supervisor.stop();
  });
  it('subscribes held plus requested instruments to the right vendor', async () => {
    const kite = feed('kite'); const deriv = feed('deriv'); const us = feed('us-delayed');
    const h = harness([kite.value, deriv.value, us.value], ['NSE:HELD', 'NASDAQ:HELD'], new Map([['OANDA:EURUSD', 2]]));
    await h.supervisor.start();
    expect(kite.calls.subscribe.mock.calls).toContainEqual([['NSE:HELD']]);
    expect(deriv.calls.subscribe.mock.calls).toContainEqual([['OANDA:EURUSD']]);
    expect(us.calls.subscribe.mock.calls).toContainEqual([['NASDAQ:HELD']]); await h.supervisor.stop();
  });
  it('retries the held list when it fails at start, then subscribes it (live finding 2026-11-10)', async () => {
    vi.useFakeTimers();
    try {
      const deriv = feed('deriv');
      const held = vi.fn().mockRejectedValueOnce(new Error('Command timed out')).mockResolvedValue(['FX:EURUSD']);
      const log = vi.fn();
      const supervisor = new FeedSupervisor({ feeds: [deriv.value], liveBars: { attach: vi.fn(() => vi.fn()), closeDue: vi.fn(() => Promise.resolve()) },
        publisher: { publish: vi.fn(() => Promise.resolve()) }, requests: { current: () => Promise.resolve(new Map()), onChange: () => () => {} }, held, log });
      await supervisor.start();
      expect(deriv.calls.subscribe.mock.calls).not.toContainEqual([['FX:EURUSD']]);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(held).toHaveBeenCalledTimes(2);
      expect(deriv.calls.subscribe.mock.calls).toContainEqual([['FX:EURUSD']]);
      await supervisor.stop();
    } finally { vi.useRealTimers(); }
  });
  it('stops retrying the held list once stopped', async () => {
    vi.useFakeTimers();
    try {
      const held = vi.fn().mockRejectedValue(new Error('Command timed out'));
      const supervisor = new FeedSupervisor({ feeds: [feed('kite').value], liveBars: { attach: vi.fn(() => vi.fn()), closeDue: vi.fn(() => Promise.resolve()) },
        publisher: { publish: vi.fn(() => Promise.resolve()) }, requests: { current: () => Promise.resolve(new Map()), onChange: () => () => {} }, held });
      await supervisor.start(); await supervisor.stop();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(held).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('unsubscribes when a request count drops to zero', async () => {
    const kite = feed('kite'); const h = harness([kite.value], [], new Map([['NSE:TEST', 1]])); await h.supervisor.start();
    h.requestChange('NSE:TEST', 0); await Promise.resolve();
    expect(kite.calls.unsubscribe.mock.calls).toContainEqual([['NSE:TEST']]); await h.supervisor.stop();
  });
  it('held continuous ids subscribe their dated contract and roll at the date change (FR-SY-5, FR-MD-5)', async () => {
    const kite = feed('kite');
    let contract = 'NSE:NIFTY26NOVFUT';
    let daily: (() => Promise<void>) | undefined;
    const supervisor = new FeedSupervisor({ feeds: [kite.value], liveBars: { attach: vi.fn(() => vi.fn()), closeDue: vi.fn(() => Promise.resolve()) },
      publisher: { publish: vi.fn(() => Promise.resolve()) },
      requests: { current: () => Promise.resolve(new Map()), onChange: () => () => {} },
      held: () => Promise.resolve(['NSE:NIFTY1!']), resolveContinuous: () => Promise.resolve(contract),
      scheduleDaily: run => { daily = run; return Promise.resolve(); } });
    await supervisor.start();
    expect(kite.calls.subscribe).toHaveBeenCalledWith(['NSE:NIFTY26NOVFUT']);
    contract = 'NSE:NIFTY26DECFUT'; await daily?.();
    expect(kite.calls.unsubscribe).toHaveBeenCalledWith(['NSE:NIFTY26NOVFUT']);
    expect(kite.calls.subscribe).toHaveBeenCalledWith(['NSE:NIFTY26DECFUT']);
    await supervisor.stop();
  });
  it('flushes forming bars then publishes stopped', async () => {
    const kite = feed('kite'); const h = harness([kite.value]); await h.supervisor.start(); h.publish.mockClear();
    await h.supervisor.stop();
    expect(h.closeDue.mock.calls).toHaveLength(1); expect(kite.calls.stop.mock.calls).toHaveLength(1);
    expect(h.publish).toHaveBeenCalledWith('kite', 'stopped', undefined);
  });
  it('does not fire the deriv watchdog in the Friday quiet window (E5)', () => {
    expect(isDerivWatchdogQuietWindow(Date.UTC(2026, 10, 6, 21, 30))).toBe(true);
    expect(isDerivWatchdogQuietWindow(Date.UTC(2026, 10, 6, 22, 0))).toBe(false);
    expect(isDerivWatchdogQuietWindow(Date.UTC(2026, 10, 7, 21, 30))).toBe(false);
  });
});
