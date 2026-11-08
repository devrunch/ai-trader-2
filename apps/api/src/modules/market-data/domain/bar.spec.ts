import { expect, it } from 'vitest';
import type { Bar } from './bar';

it('represents a UTC bar with nullable volume (FR-MD-2)', () => {
  const bar: Bar = { time: 0, open: 1, high: 2, low: 0, close: 1, volume: null };
  expect(bar).toEqual({ time: 0, open: 1, high: 2, low: 0, close: 1, volume: null });
});
