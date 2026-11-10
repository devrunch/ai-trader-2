import { expect, it } from 'vitest';
import { exchangeTimezone } from './market-hours';

it('returns the exchange timezone of an instrument, UTC when the exchange has no calendar', () => {
  expect(exchangeTimezone('NSE:RELIANCE')).toBe('Asia/Kolkata');
  expect(exchangeTimezone('NYSE:IBM')).toBe('America/New_York');
  expect(exchangeTimezone('NOPE:X')).toBe('UTC');
});
