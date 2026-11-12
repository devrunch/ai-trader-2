import type { CalendarQuery, EconomicEvent } from '@aitrader/contracts';
import { movesFor } from '../domain/moves';

export interface RawEvent { title: string; country: string; at: string; impact: EconomicEvent['impact']; forecast: string | null; previous: string | null }
export interface EventSource { fetch(signal: AbortSignal): Promise<RawEvent[]> }
export interface CalendarStore {
  upsert(events: Array<Omit<EconomicEvent, 'moves'>>): Promise<void>;
  between(from: number, to: number): Promise<Array<Omit<EconomicEvent, 'moves'>>>;
}

const RANK: Readonly<Record<EconomicEvent['impact'], number>> = { High: 3, Medium: 2, Low: 1, Holiday: 0 };

/** Scheduled releases (CPI, payrolls, central banks), refreshed every few hours; the agent and the Home page read them. */
export class EconomicCalendar {
  constructor(private readonly source: EventSource, private readonly store: CalendarStore,
    private readonly env: { now: () => number; id: (e: RawEvent) => string }) {}

  async refresh(signal: AbortSignal): Promise<number> {
    const raw = await this.source.fetch(signal);
    await this.store.upsert(raw.map(e => ({ ...e, id: this.env.id(e) })));
    return raw.length;
  }

  /** Upcoming (and the last 6 hours, so today's releases stay visible), soonest first. */
  /** `asOf` replays the calendar at an earlier moment: the same window around that time, and nothing the clock had not reached is treated as released. */
  async list(query: CalendarQuery, asOf?: number): Promise<EconomicEvent[]> {
    const now = asOf ?? this.env.now();
    const rows = await this.store.between(now - 6 * 3_600_000, now + query.days * 86_400_000);
    return rows.filter(e => RANK[e.impact] >= RANK[query.impact] && (!query.country || e.country === query.country))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .map(e => ({ ...e, moves: movesFor(e.country, e.title) }));
  }
}
