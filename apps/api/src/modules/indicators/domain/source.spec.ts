import { expect, it } from 'vitest';
import { priceOf } from './source';

const bar = { time: 0, open: 10, high: 16, low: 8, close: 12, volume: 5 };

it('computes every TradingView price source', () => {
  expect(priceOf(bar, 'open')).toBe(10);
  expect(priceOf(bar, 'high')).toBe(16);
  expect(priceOf(bar, 'low')).toBe(8);
  expect(priceOf(bar, 'close')).toBe(12);
  expect(priceOf(bar, 'hl2')).toBe(12);
  expect(priceOf(bar, 'hlc3')).toBe(12);
  expect(priceOf(bar, 'ohlc4')).toBe(11.5);
  expect(priceOf(bar, 'hlcc4')).toBe(12);
});
