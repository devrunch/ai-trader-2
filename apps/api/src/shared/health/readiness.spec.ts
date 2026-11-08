import 'reflect-metadata';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReadinessRegistry } from './readiness';

// NFR-RB-6
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it('ok with no checks', async () => {
  expect(await new ReadinessRegistry().runAll()).toEqual({ ok: true, checks: {} });
});
it('reports a failing check with its reason', async () => {
  const registry = new ReadinessRegistry();
  registry.register('fake', () => { throw new Error('conn refused'); });
  expect(await registry.runAll()).toEqual({ ok: false, checks: { fake: { status: 'down', reason: 'conn refused' } } });
});
it('times out a hanging check', async () => {
  const registry = new ReadinessRegistry();
  registry.register('fake', () => new Promise(() => undefined));
  const result = registry.runAll(100);
  await vi.advanceTimersByTimeAsync(100);
  expect(await result).toEqual({ ok: false, checks: { fake: { status: 'down', reason: 'timeout' } } });
});
it('rejects duplicate names', () => {
  const registry = new ReadinessRegistry();
  registry.register('fake', () => Promise.resolve({ status: 'up' }));
  expect(() => { registry.register('fake', () => Promise.resolve({ status: 'up' })); }).toThrow('fake');
});
