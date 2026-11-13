import type { Sentiment } from '@aitrader/contracts';

const DEAD_ZONE = 0.15;
export const labelOf = (score: number): Sentiment['label'] => (score > DEAD_ZONE ? 'bullish' : score < -DEAD_ZONE ? 'bearish' : 'neutral');
const round2 = (n: number): number => Math.round(n * 100) / 100;

const POSITIVE = /^(surg|rall|gain|jump|soar|ris(?:e|es|ing)$|rose$|record|strong|beat|upgrad|bull|profit|growth|recover|boost|optimis|climb|advanc|outperform|approv)/;
const NEGATIVE = /^(plung|slump|fall|fell|drop|crash|tumbl|slid|loss|weak|miss|downgrad|bear|fear|hike|probe|fraud|sell-?off|declin|sink|sank|warn|ban|cuts?$|lower|slash|concern|worr|crisis|war$|sanction)/;
const NEGATORS = new Set(['not', 'no', 'never', "isn't", "doesn't", "didn't", "won't", 'fails', 'fail', 'without']);

/** Cheap word-list read of a headline; the last fallback when no model is available or the daily cap is spent. */
export function rulesSentiment(text: string): Sentiment {
  const words = text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
  let sum = 0;
  words.forEach((word, i) => {
    const sign = POSITIVE.test(word) ? 1 : NEGATIVE.test(word) ? -1 : 0;
    if (sign === 0) return;
    const negated = words.slice(Math.max(0, i - 2), i).some(w => NEGATORS.has(w));
    sum += negated ? -sign : sign;
  });
  const score = round2(Math.tanh(0.5 * sum));
  return { label: labelOf(score), score, by: 'rules' };
}

interface Scored { publishedAt: number; sentiment: Sentiment | null }

/** Average sentiment and label counts over each window ending at `now`; unscored items are left out. */
export function summarise(scope: string, rows: Scored[], now: number, windows: number[]): { scope: string; asOf: string; windows: Array<{ hours: number; items: number; score: number | null; bullish: number; bearish: number; neutral: number }> } {
  return { scope, asOf: new Date(now).toISOString(), windows: windows.map(hours => {
    const inside = rows.flatMap(r => (r.sentiment && r.publishedAt <= now && r.publishedAt > now - hours * 3_600_000 ? [r.sentiment] : []));
    const count = (label: Sentiment['label']): number => inside.filter(s => s.label === label).length;
    return { hours, items: inside.length, score: inside.length ? round2(inside.reduce((sum, s) => sum + s.score, 0) / inside.length) : null,
      bullish: count('bullish'), bearish: count('bearish'), neutral: count('neutral') };
  }) };
}
