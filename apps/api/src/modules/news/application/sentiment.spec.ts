import { describe, expect, it, vi } from 'vitest';
import type { Sentiment } from '@aitrader/contracts';
import type { DailyBudget } from '../../../shared/redis/daily-budget';
import { SentimentService, type BatchScorer } from './sentiment';

const signal = new AbortController().signal;
const verdict = (by: Sentiment['by'], score = 0.5): Sentiment => ({ label: score > 0 ? 'bullish' : 'bearish', score, by });
const scorer = (by: Sentiment['by']): BatchScorer & { calls: number } => {
  const s = { calls: 0, score: (items: Array<{ id: string }>) => { s.calls++; return Promise.resolve(new Map(items.map(i => [i.id, verdict(by)]))); } };
  return s;
};
const budget = (left: number): DailyBudget => ({ take: n => { const granted = Math.min(n, left); left -= granted; return Promise.resolve(granted); } });
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${String(i)}`, text: i % 2 ? 'stocks plunge on fraud probe' : 'stocks surge to record' }));

describe('SentimentService', () => {
  it('sends items to the LLM while the daily cap allows', async () => {
    const llm = scorer('llm');
    const out = await new SentimentService(llm, null, budget(10)).score(items(3), signal);
    expect([...out.values()].map(v => v.by)).toEqual(['llm', 'llm', 'llm']);
  });
  it('sends the items past the cap to FinBERT, and to word rules when FinBERT is off (NEWS_LLM_DAILY)', async () => {
    const withFinbert = await new SentimentService(scorer('llm'), scorer('finbert'), budget(2)).score(items(4), signal);
    expect([...withFinbert.values()].map(v => v.by)).toEqual(['llm', 'llm', 'finbert', 'finbert']);
    const rulesOnly = await new SentimentService(scorer('llm'), null, budget(1)).score(items(3), signal);
    expect(rulesOnly.get('i0')?.by).toBe('llm');
    expect(rulesOnly.get('i1')).toMatchObject({ by: 'rules', label: 'bearish' });
    expect(rulesOnly.get('i2')).toMatchObject({ by: 'rules', label: 'bullish' });
  });
  it('falls back down the chain when a scorer fails, and says so', async () => {
    const warn = vi.fn();
    const broken: BatchScorer = { score: () => Promise.reject(new Error('503')) };
    const out = await new SentimentService(broken, broken, budget(10), warn).score(items(2), signal);
    expect([...out.values()].map(v => v.by)).toEqual(['rules', 'rules']);
    expect(warn).toHaveBeenCalledTimes(2);
  });
  it('uses rules only when no model is configured and never calls a scorer for an empty batch', async () => {
    const out = await new SentimentService(null, null, budget(0)).score(items(2), signal);
    expect([...out.values()].every(v => v.by === 'rules')).toBe(true);
    expect((await new SentimentService(scorer('llm'), null, budget(5)).score([], signal)).size).toBe(0);
  });
});
