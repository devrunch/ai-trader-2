import type { EconomicEvent, NewsItem } from '@aitrader/contracts';
import type { WatchReader } from '../application/agent-tasks';

const MAX_CHANGES = 6;

/** Headlines and calendar events for the watches; a move is the quote's change against the previous close. */
export class FeedWatchReader implements WatchReader {
  constructor(private readonly news$: { list(query: { hours: number; limit: number }): Promise<NewsItem[]> },
    private readonly calendar: { list(query: { days: number; impact: 'Low' }): Promise<EconomicEvent[]> },
    private readonly quote: { execute(id: string): Promise<{ changePct: number | null }> }) {}

  news(): Promise<NewsItem[]> { return this.news$.list({ hours: 48, limit: 200 }); }

  events(): Promise<EconomicEvent[]> { return this.calendar.list({ days: 1, impact: 'Low' }); }

  async changes(symbols: string[]): Promise<string[]> {
    const lines = await Promise.all(symbols.slice(0, MAX_CHANGES).map(async symbol => {
      const { changePct } = await this.quote.execute(symbol).catch(() => ({ changePct: null }));
      return changePct === null ? null : `${symbol} ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% on the day`;
    }));
    return lines.filter((l): l is string => l !== null);
  }
}
