import { expect, it } from 'vitest';
import { anchorKey } from './anchor';

const at = (iso: string) => new Date(iso).getTime();

it('keys bars by their anchor period in the exchange timezone (VWAP anchors)', () => {
  expect(anchorKey(at('2024-12-31T23:59:00Z'), 'Session', 'UTC')).toBe('2024-12-31');
  expect(anchorKey(at('2024-12-31T23:59:00Z'), 'Session', 'Asia/Kolkata')).toBe('2025-01-01');
  expect(anchorKey(at('2024-12-29T12:00:00Z'), 'Week', 'UTC')).not.toBe(anchorKey(at('2024-12-30T12:00:00Z'), 'Week', 'UTC'));
  expect(anchorKey(at('2024-12-30T12:00:00Z'), 'Week', 'UTC')).toBe(anchorKey(at('2025-01-05T12:00:00Z'), 'Week', 'UTC'));
  expect(anchorKey(at('2025-01-31T12:00:00Z'), 'Month', 'UTC')).toBe('2025-01');
  expect(anchorKey(at('2025-03-31T12:00:00Z'), 'Quarter', 'UTC')).toBe('2025-Q1');
  expect(anchorKey(at('2025-04-01T12:00:00Z'), 'Quarter', 'UTC')).toBe('2025-Q2');
  expect(anchorKey(at('2025-06-01T12:00:00Z'), 'Year', 'UTC')).toBe('2025');
  expect(() => anchorKey(0, 'Decade', 'UTC')).toThrow('Unsupported anchor: Decade');
});
