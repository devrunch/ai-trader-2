import type { Sentiment } from '@aitrader/contracts';
import type { DailyBudget } from '../../../shared/redis/daily-budget';
import { rulesSentiment } from '../domain/sentiment';

/** Splits a list into chunks of at most `size`. */
export function inBatches<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

export interface SentimentInput { id: string; text: string }
/** One way of scoring a batch of headlines (an LLM or FinBERT); rejects when it cannot, so the next one takes over. */
export interface BatchScorer { score(items: SentimentInput[], signal: AbortSignal): Promise<Map<string, Sentiment>> }

/** Scores headlines: the LLM while the daily cap allows, then FinBERT, then word rules. Never throws; every item gets a verdict. */
export class SentimentService {
  constructor(private readonly llm: BatchScorer | null, private readonly finbert: BatchScorer | null, private readonly budget: DailyBudget,
    private readonly warn: (message: string, detail: Record<string, unknown>) => void = () => undefined) {}

  async score(items: SentimentInput[], signal: AbortSignal): Promise<Map<string, Sentiment>> {
    const out = new Map<string, Sentiment>();
    let pending = items;
    if (this.llm && pending.length > 0) {
      const granted = await this.budget.take(pending.length).catch(() => 0);
      pending = await this.run('llm', this.llm, pending.slice(0, granted), signal, out).then(missed => [...missed, ...pending.slice(granted)]);
    }
    if (this.finbert && pending.length > 0) pending = await this.run('finbert', this.finbert, pending, signal, out);
    for (const item of pending) out.set(item.id, rulesSentiment(item.text));
    return out;
  }

  private async run(name: string, scorer: BatchScorer, items: SentimentInput[], signal: AbortSignal, out: Map<string, Sentiment>): Promise<SentimentInput[]> {
    if (items.length === 0) return [];
    try {
      for (const [id, verdict] of await scorer.score(items, signal)) out.set(id, verdict);
    } catch (error) {
      this.warn('Sentiment scorer failed', { scorer: name, error: error instanceof Error ? error.name : 'unknown' });
    }
    return items.filter(i => !out.has(i.id));
  }
}
