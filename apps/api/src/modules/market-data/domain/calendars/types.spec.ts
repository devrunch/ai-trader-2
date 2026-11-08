import { expect, it } from 'vitest';
import type { MarketCalendar, SessionWindow } from './types';

it('describes half-open session windows without runtime dependencies (E13)', () => {
  const window: SessionWindow = { open: 1000, close: 2000 };
  const calendar: Pick<MarketCalendar, 'id' | 'timezone'> = { id: 'NSE', timezone: 'Asia/Kolkata' };
  expect(window.close - window.open).toBe(1000);
  expect(calendar.timezone).toBe('Asia/Kolkata');
});
