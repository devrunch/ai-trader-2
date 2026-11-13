import type { EconomicEvent, EventScorecard, NewsItem, ScanResult, ScreenSpec } from '@aitrader/contracts';
import type { WatchReader } from '../application/agent-tasks';
import type { HeldPosition } from '../domain/event-brief';

const MAX_CHANGES = 6;

type Universe = Parameters<NonNullable<WatchReader['members']>>[0];
/** Optional readers behind the move watch and the pre-event brief; each missing one switches only its own feature off. */
export interface WatchExtras {
  moves?: (symbols: string[], minutes: number, now: number) => Promise<Map<string, number | null>>;
  members?: (universe: Universe, userId: string) => Promise<string[]>;
  scorecard?: (event: EconomicEvent) => Promise<EventScorecard | null>;
  positions?: (userId: string, symbols: string[]) => Promise<HeldPosition[]>;
}

/** Headlines and calendar events for the watches; a move is the quote's change against the previous close. */
export class FeedWatchReader implements WatchReader {
  constructor(private readonly news$: { list(query: { hours: number; limit: number }): Promise<NewsItem[]> },
    private readonly calendar: { list(query: { days: number; impact: 'Low' }): Promise<EconomicEvent[]> },
    private readonly quote: { execute(id: string): Promise<{ changePct: number | null }> },
    private readonly scanner?: (spec: ScreenSpec, userId: string) => Promise<ScanResult>,
    private readonly extras: WatchExtras = {}) {}

  /** No bars means no data: every symbol is null and nothing fires. */
  async moves(symbols: string[], minutes: number, now: number): Promise<Map<string, number | null>> {
    return this.extras.moves ? this.extras.moves(symbols, minutes, now) : new Map(symbols.map(s => [s, null]));
  }

  members(universe: Universe, userId: string): Promise<string[]> { return this.extras.members ? this.extras.members(universe, userId) : Promise.resolve([]); }

  scorecard(event: EconomicEvent): Promise<EventScorecard | null> { return this.extras.scorecard ? this.extras.scorecard(event) : Promise.resolve(null); }

  positions(userId: string, symbols: string[]): Promise<HeldPosition[]> { return this.extras.positions ? this.extras.positions(userId, symbols) : Promise.resolve([]); }

  screen(spec: ScreenSpec, userId: string): Promise<ScanResult> {
    const scanner = this.scanner;
    if (!scanner) return Promise.reject(new Error('screening is not available'));
    return scanner(spec, userId);
  }

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
