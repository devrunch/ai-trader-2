import { expect, it, vi } from 'vitest';
import { CircuitBreaker } from './circuit-breaker.js';
import { CircuitOpenError } from './errors.js';

// NFR-RB-2: consecutive failures and a single recovery probe.
function fixture(threshold = 2, isFailure?: (err: unknown) => boolean) {
  let now = 0;
  const breaker = new CircuitBreaker({ failureThreshold: threshold, openMs: 1000, now: () => now, ...(isFailure ? { isFailure } : {}) });
  return { breaker, advance: (ms: number) => { now += ms; } };
}
const fail = () => Promise.reject(new Error('down'));
const succeed = () => Promise.resolve('ok');
it('opens after threshold consecutive failures', async () => {
  const { breaker } = fixture();
  await expect(breaker.exec(fail)).rejects.toThrow('down');
  expect(breaker.state).toBe('closed');
  await expect(breaker.exec(fail)).rejects.toThrow('down');
  expect(breaker.state).toBe('open');
});
it('a success resets the failure count', async () => {
  const { breaker } = fixture();
  await expect(breaker.exec(fail)).rejects.toThrow();
  await breaker.exec(succeed);
  await expect(breaker.exec(fail)).rejects.toThrow();
  expect(breaker.state).toBe('closed');
});
it('rejects fast while open with retryAfterMs', async () => {
  const { breaker, advance } = fixture(1);
  await expect(breaker.exec(fail)).rejects.toThrow();
  advance(250);
  const fn = vi.fn(succeed);
  await expect(breaker.exec(fn)).rejects.toMatchObject({ name: 'CircuitOpenError', retryAfterMs: 750 });
  expect(fn).not.toHaveBeenCalled();
});
it('half-opens after openMs and closes on probe success', async () => {
  const { breaker, advance } = fixture(1);
  await expect(breaker.exec(fail)).rejects.toThrow();
  advance(1000);
  expect(breaker.state).toBe('half-open');
  await expect(breaker.exec(succeed)).resolves.toBe('ok');
  expect(breaker.state).toBe('closed');
});
it('reopens on probe failure', async () => {
  const { breaker, advance } = fixture(1);
  await expect(breaker.exec(fail)).rejects.toThrow();
  advance(1000);
  await expect(breaker.exec(fail)).rejects.toThrow('down');
  expect(breaker.state).toBe('open');
  await expect(breaker.exec(succeed)).rejects.toMatchObject({ retryAfterMs: 1000 });
});
it('allows exactly one concurrent probe in half-open', async () => {
  const { breaker, advance } = fixture(1);
  await expect(breaker.exec(fail)).rejects.toThrow();
  advance(1000);
  let complete: (value: string) => void = () => {};
  const pending = breaker.exec(() => new Promise<string>((resolve) => { complete = resolve; }));
  await expect(breaker.exec(succeed)).rejects.toBeInstanceOf(CircuitOpenError);
  complete('recovered');
  await expect(pending).resolves.toBe('recovered');
});
it('ignores errors that isFailure says are not failures', async () => {
  const { breaker, advance } = fixture(1, (err) => err instanceof Error && err.message === 'down');
  const ignored = () => Promise.reject(new Error('404'));
  await expect(breaker.exec(ignored)).rejects.toThrow('404');
  expect(breaker.state).toBe('closed');
  await expect(breaker.exec(fail)).rejects.toThrow();
  advance(1000);
  await expect(breaker.exec(ignored)).rejects.toThrow('404');
  await expect(breaker.exec(succeed)).resolves.toBe('ok');
  expect(breaker.state).toBe('closed');
});
