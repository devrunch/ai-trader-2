import { expect, it } from 'vitest';
import { backoffDelay } from './backoff.js';

// NFR-RB-1: full jitter with a bounded exponential cap.
it('is within 0..cap for every attempt', () => {
  for (let attempt = 0; attempt <= 20; attempt++) {
    const cap = Math.min(10000, 100 * 2 ** attempt);
    const delay = backoffDelay(attempt, { baseMs: 100, maxMs: 10000, random: () => 0.999999 });
    expect(delay).toBe(Math.floor(0.999999 * cap));
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThan(cap);
  }
});
it('never exceeds maxMs', () => {
  expect(backoffDelay(20, { baseMs: 100, maxMs: 500, random: () => 0.999999 })).toBe(499);
});
it('is 0 with random 0', () => {
  expect(backoffDelay(10, { baseMs: 100, maxMs: 500, random: () => 0 })).toBe(0);
});
