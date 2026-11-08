import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManualScheduler, LiveStore, rafScheduler } from './index';

describe('LiveStore (NFR-PF-3, SRD §10.3)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('coalesces a flood into one notification with the latest value', () => {
    const scheduler = createManualScheduler();
    const store = new LiveStore<number>(scheduler);
    const listener = vi.fn();
    store.subscribe('NSE:X', listener);
    for (let i = 0; i < 1000; i++) store.set('NSE:X', i);
    expect(scheduler.pending).toBe(1);
    scheduler.flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get('NSE:X')).toBe(999);
    // The default scheduler is part of the public primitive.
    expect(rafScheduler).toHaveProperty('schedule', expect.any(Function));
  });

  it('notifies only subscribers of changed keys', () => {
    const scheduler = createManualScheduler();
    const store = new LiveStore<number>(scheduler);
    const changed = vi.fn();
    const unchanged = vi.fn();
    store.subscribe('a', changed);
    store.subscribe('b', unchanged);
    store.set('a', 1);
    scheduler.flush();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(unchanged).not.toHaveBeenCalled();
  });

  it('get returns the latest value before the flush', () => {
    const scheduler = createManualScheduler();
    const store = new LiveStore<number>(scheduler);
    store.set('a', 1);
    store.set('a', 2);
    expect(store.get('a')).toBe(2);
    expect(store.get('missing')).toBeUndefined();
    expect(scheduler.pending).toBe(1);
  });

  it('unsubscribe during notification is safe', () => {
    const scheduler = createManualScheduler();
    const store = new LiveStore<number>(scheduler);
    const b = vi.fn();
    const unsubscribeA = store.subscribe('a', () => {
      unsubscribeA();
      unsubscribeB();
      unsubscribeB();
    });
    const unsubscribeB = store.subscribe('a', b);
    store.set('a', 1);
    expect(() => { scheduler.flush(); }).not.toThrow();
    expect(b).not.toHaveBeenCalled();
  });

  it('subscribeAll receives the set of changed keys once per frame', () => {
    const scheduler = createManualScheduler();
    const store = new LiveStore<number>(scheduler);
    const listener = vi.fn();
    const unsubscribe = store.subscribeAll(listener);
    store.set('a', 1);
    store.set('b', 2);
    store.set('a', 3);
    scheduler.flush();
    expect(listener).toHaveBeenCalledExactlyOnceWith(new Set(['a', 'b']));
    unsubscribe();
    unsubscribe();
    store.set('a', 4);
    scheduler.flush();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('set inside a listener schedules the next frame', () => {
    const scheduler = createManualScheduler();
    const store = new LiveStore<number>(scheduler);
    const listener = vi.fn(() => { store.set('a', 2); });
    store.subscribe('a', listener);
    store.set('a', 1);
    scheduler.flush();
    expect(scheduler.pending).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get('a')).toBe(2);
  });

  it('a throwing listener does not block others', () => {
    const microtask = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(() => undefined);
    const scheduler = createManualScheduler();
    const store = new LiveStore<number>(scheduler);
    const error = new Error('listener failed');
    const listener = vi.fn();
    store.subscribe('a', () => { throw error; });
    store.subscribe('a', listener);
    store.set('a', 1);
    scheduler.flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(microtask).toHaveBeenCalledTimes(1);
    expect(() => microtask.mock.calls[0]?.[0]()).toThrow(error);
  });

  it('delete notifies subscribers and get returns undefined', () => {
    const scheduler = createManualScheduler();
    const store = new LiveStore<number>(scheduler);
    store.set('a', 1);
    scheduler.flush();
    const listener = vi.fn();
    store.subscribe('a', listener);
    store.delete('a');
    expect(store.get('a')).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
    scheduler.flush();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
