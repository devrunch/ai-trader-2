import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { retry, sleep } from './retry.js';
import { AbortedError } from './errors.js';

// NFR-RB-1, NFR-RB-3.
const opts = { retries: 2, baseMs: 100, maxMs: 1000, random: () => 0.5 };
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it('returns the first success without delay', async () => {
  const fn = vi.fn(() => Promise.resolve('ok'));
  await expect(retry(fn, opts)).resolves.toBe('ok');
  expect(fn).toHaveBeenCalledOnce();
  expect(fn).toHaveBeenCalledWith(0, expect.any(AbortSignal));
  expect(vi.getTimerCount()).toBe(0);
});
it('stops after retries+1 attempts and rethrows the last error', async () => {
  const fn = vi.fn((attempt: number) => Promise.reject(new Error(`failure ${String(attempt)}`)));
  const assertion = expect(retry(fn, opts)).rejects.toThrow('failure 2');
  await vi.runAllTimersAsync();
  await assertion;
  expect(fn).toHaveBeenCalledTimes(3);
});
it('does not retry when retryOn returns false', async () => {
  const error = new Error('permanent');
  const fn = vi.fn(() => Promise.reject(error));
  await expect(retry(fn, { ...opts, retryOn: () => false })).rejects.toBe(error);
  expect(fn).toHaveBeenCalledOnce();
});
it('aborts promptly when signal aborts during backoff', async () => {
  const controller = new AbortController();
  const fn = vi.fn(() => Promise.reject(new Error('transient')));
  const assertion = expect(retry(fn, { ...opts, signal: controller.signal })).rejects.toBeInstanceOf(AbortedError);
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await assertion;
  expect(fn).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('never retries AbortedError', async () => {
  const fn = vi.fn(() => Promise.reject(new AbortedError()));
  await expect(retry(fn, opts)).rejects.toBeInstanceOf(AbortedError);
  expect(fn).toHaveBeenCalledOnce();
});
it('calls onRetry with the delay used', async () => {
  const error = new Error('transient');
  const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ok');
  const onRetry = vi.fn();
  const result = retry(fn, { ...opts, onRetry });
  await vi.advanceTimersByTimeAsync(49);
  expect(onRetry).toHaveBeenCalledExactlyOnceWith(error, 0, 50);
  expect(fn).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  await expect(result).resolves.toBe('ok');
});
it('rejects before calling fn when already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  const fn = vi.fn(() => Promise.resolve('ok'));
  await expect(retry(fn, { ...opts, signal: controller.signal })).rejects.toBeInstanceOf(AbortedError);
  expect(fn).not.toHaveBeenCalled();
  await expect(sleep(10, controller.signal)).rejects.toBeInstanceOf(AbortedError);
  expect(vi.getTimerCount()).toBe(0);
});
it('resolves sleep and removes its abort listener', async () => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const result = sleep(10, controller.signal);
  await vi.advanceTimersByTimeAsync(10);
  await expect(result).resolves.toBeUndefined();
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});
