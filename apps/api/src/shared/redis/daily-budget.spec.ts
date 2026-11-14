import type { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import { RedisDailyBudget } from './daily-budget';

const fakeRedis = (): Redis => {
  const counts = new Map<string, number>();
  return { incrby: (key: string, n: number) => { counts.set(key, (counts.get(key) ?? 0) + n); return Promise.resolve(counts.get(key)); }, expire: () => Promise.resolve(1) } as unknown as Redis;
};

describe('RedisDailyBudget', () => {
  it('grants up to the cap per day and nothing after (NEWS_LLM_DAILY)', async () => {
    let now = Date.parse('2026-11-12T10:00:00Z');
    const budget = new RedisDailyBudget(fakeRedis(), 'test', 100, () => now);
    expect([await budget.take(60), await budget.take(60), await budget.take(10)]).toEqual([60, 40, 0]);
    now += 86_400_000;
    expect(await budget.take(30)).toBe(30);
  });
  it('grants nothing when the cap is 0', async () => {
    expect(await new RedisDailyBudget(fakeRedis(), 'test', 0).take(5)).toBe(0);
  });
});
