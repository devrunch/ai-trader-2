import { describe, expect, it } from 'vitest';
import { labelOf, rulesSentiment, summarise } from './sentiment';

describe('rulesSentiment', () => {
  it('reads bullish, bearish and neutral headlines', () => {
    expect(rulesSentiment('Nifty surges to record high on strong earnings')).toMatchObject({ label: 'bullish', by: 'rules' });
    expect(rulesSentiment('Sensex plunges as banks slump on rate hike fears').label).toBe('bearish');
    expect(rulesSentiment('RBI governor to speak on Friday')).toEqual({ label: 'neutral', score: 0, by: 'rules' });
  });
  it('flips a positive word after a negation', () => {
    expect(rulesSentiment('Profit does not rise as sales fall').score).toBeLessThan(0);
  });
  it('keeps the score in [-1, 1]', () => {
    expect(Math.abs(rulesSentiment('surge surge surge rally rally record high jump soar gain').score)).toBeLessThanOrEqual(1);
  });
});

describe('labelOf', () => {
  it('uses a dead zone around zero', () => {
    expect([labelOf(0.05), labelOf(0.3), labelOf(-0.3), labelOf(-0.1)]).toEqual(['neutral', 'bullish', 'bearish', 'neutral']);
  });
});

describe('summarise', () => {
  it('averages scores per window and counts labels', () => {
    const now = Date.UTC(2026, 10, 12, 12);
    const rows = [
      { publishedAt: now - 3_600_000, sentiment: { label: 'bullish' as const, score: 0.5, by: 'llm' as const } },
      { publishedAt: now - 7_200_000, sentiment: { label: 'bearish' as const, score: -0.1, by: 'llm' as const } },
      { publishedAt: now - 3 * 86_400_000, sentiment: { label: 'bullish' as const, score: 0.9, by: 'llm' as const } },
      { publishedAt: now - 3_600_000, sentiment: null },
    ];
    const w = summarise('NSE:INFY', rows, now, [24, 168]);
    expect(w.windows[0]).toEqual({ hours: 24, items: 2, score: 0.2, bullish: 1, bearish: 1, neutral: 0 });
    expect(w.windows[1]?.items).toBe(3);
    expect(summarise('x', [], now, [24]).windows[0]?.score).toBeNull();
  });
});
