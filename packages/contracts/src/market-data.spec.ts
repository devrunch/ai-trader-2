import { expect, it } from 'vitest';
import { DataStatusSchema, BarsResponseSchema, QuoteResponseSchema } from './market-data.js';

it('rejects unknown status states and extra keys (FR-MD-1, FR-UI-7/8)', () => {
  for (const value of [{ state: 'live' }, { state: 'ok', extra: true }, { state: 'delayed', delayMs: 0 },
    { state: 'stale', reason: 'OTHER' }, { state: 'stale', reason: 'NO_DATA', extra: 1 }]) {
    expect(DataStatusSchema.safeParse(value).success).toBe(false);
  }
  expect(BarsResponseSchema.safeParse({ instrumentId: 'NSE:X', resolvedId: 'NSE:X', interval: '1',
    bars: [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: null, extra: true }], nextBefore: null, status: { state: 'ok' } }).success).toBe(false);
  expect(QuoteResponseSchema.safeParse({ instrumentId: 'NSE:X', resolvedId: 'NSE:X', price: 1,
    change: null, changePct: null, at: 1, status: { state: 'ok' }, extra: true }).success).toBe(false);
});
