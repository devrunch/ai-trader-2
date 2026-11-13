import type { DailyBudget } from '../../../shared/redis/daily-budget';

export interface WebResult { title: string; url: string; snippet: string }
export interface WebSearchSource { search(query: string, limit: number, signal: AbortSignal): Promise<WebResult[]> }
export type WebSearchOutcome =
  | { available: true; query: string; results: WebResult[]; source: string }
  | { available: false; reason: string; source: string };

const MAX_WEB_RESULTS = 5;
const SOURCE = 'tavily web search';

/** Fresh context the feeds miss. Off without a key; capped per day across users; results are always cited (title and url) and at most five. */
export class ResearchService {
  constructor(private readonly source: WebSearchSource | null, private readonly budget: DailyBudget) {}

  async search(query: string, signal: AbortSignal): Promise<WebSearchOutcome> {
    if (!this.source) return { available: false, reason: 'web search is off (no TAVILY_API_KEY)', source: SOURCE };
    if (await this.budget.take(1).catch(() => 0) < 1) return { available: false, reason: 'the daily web search cap is spent; use getNews and the other data tools', source: SOURCE };
    const results = await this.source.search(query.trim().slice(0, 300), MAX_WEB_RESULTS, signal);
    return { available: true, query, results: results.slice(0, MAX_WEB_RESULTS), source: SOURCE };
  }
}
