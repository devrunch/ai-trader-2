import { expect, it } from 'vitest';
import { marketStatus } from './market-status';

it('reports NSE open during cash hours on a weekday', () => {
  const s = marketStatus(new Date('2026-11-12T05:00:00Z'));
  expect(s.nse.label).toBe('NSE open');
  expect(s.us.label).toBe('US closed');
  expect(s.clock).toBe('10:30 IST');
});

it('reports NSE closed at the weekend and the US open on a weekday afternoon', () => {
  expect(marketStatus(new Date('2026-11-14T05:00:00Z')).nse.label).toBe('NSE closed');
  expect(marketStatus(new Date('2026-11-12T16:00:00Z')).us.label).toBe('US open');
});
