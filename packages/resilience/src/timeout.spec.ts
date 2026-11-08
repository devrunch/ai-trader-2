import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { withTimeout } from './timeout.js';
import { AbortedError, TimeoutError } from './errors.js';

// NFR-RB-3: deadlines propagate cancellation and release resources.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
it('resolves when fn finishes in time', async () => {
  await expect(withTimeout(() => Promise.resolve(42), 100)).resolves.toBe(42);
});
it('rejects TimeoutError and aborts the inner signal', async () => {
  let inner: AbortSignal | undefined;
  const result = withTimeout((signal) => {
    inner = signal;
    return new Promise<never>(() => {});
  }, 100);
  const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);
  await vi.advanceTimersByTimeAsync(100);
  await assertion;
  expect(inner?.aborted).toBe(true);
});
it('parent abort rejects AbortedError and aborts the inner signal', async () => {
  const parent = new AbortController();
  let inner: AbortSignal | undefined;
  const result = withTimeout((signal) => {
    inner = signal;
    return new Promise<never>(() => {});
  }, 100, parent.signal);
  const assertion = expect(result).rejects.toBeInstanceOf(AbortedError);
  parent.abort();
  await assertion;
  expect(inner?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it('leaves no pending timers', async () => {
  await withTimeout(() => Promise.resolve('ok'), 100);
  expect(vi.getTimerCount()).toBe(0);
  await expect(withTimeout(() => { throw new Error('sync'); }, 100)).rejects.toThrow('sync');
  expect(vi.getTimerCount()).toBe(0);
});
it('rejects an already aborted parent without calling fn', async () => {
  const parent = new AbortController();
  parent.abort();
  const fn = vi.fn(() => Promise.resolve('ok'));
  await expect(withTimeout(fn, 100, parent.signal)).rejects.toBeInstanceOf(AbortedError);
  expect(fn).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
