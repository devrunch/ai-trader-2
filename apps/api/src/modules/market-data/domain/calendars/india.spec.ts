import { expect, it } from 'vitest';
import { INDIA_HOLIDAYS, MUHURAT_2026 } from './india';

it('curates unique named holidays and the Muhurat date (E13)', () => {
  expect(INDIA_HOLIDAYS).toHaveLength(20);
  expect(new Set(INDIA_HOLIDAYS.map(holiday => holiday.date)).size).toBe(20);
  expect(INDIA_HOLIDAYS.every(holiday => holiday.name.length > 0)).toBe(true);
  expect(MUHURAT_2026).toBe('2026-11-08');
});
