import type { CalendarQuery, EconomicEvent } from '@aitrader/contracts';
import { movesFor } from '../domain/moves';
import type { EventSpecLookup } from './ports/event-specs';

export interface RawEvent { title: string; country: string; at: string; impact: EconomicEvent['impact']; forecast: string | null; previous: string | null }
export interface EventSource { fetch(signal: AbortSignal): Promise<RawEvent[]> }
/** A stored row: the event with its captured actual, and when that actual was stored (the store's clock, so `asOf` can hide it). */
export type StoredEvent = Omit<EconomicEvent, 'moves' | 'spec' | 'reactions'> & { actualAt?: string | null };
export interface CalendarStore {
  /** Writes the schedule; an existing row keeps its actual and surprise. */
  upsert(events: Array<Omit<EconomicEvent, 'moves'>>): Promise<void>;
  between(from: number, to: number): Promise<StoredEvent[]>;
}

const RANK: Readonly<Record<EconomicEvent['impact'], number>> = { High: 3, Medium: 2, Low: 1, Holiday: 0 };

/** Scheduled releases (CPI, payrolls, central banks), refreshed every few hours; the agent and the Home page read them. */
export class EconomicCalendar {
  constructor(private readonly source: EventSource, private readonly store: CalendarStore,
    private readonly env: { now: () => number; id: (e: RawEvent) => string }, private readonly specs?: EventSpecLookup) {}

  async refresh(signal: AbortSignal): Promise<number> {
    const raw = await this.source.fetch(signal);
    await this.store.upsert(raw.map(e => ({ ...e, id: this.env.id(e) })));
    return raw.length;
  }

  /**
   * Stores a company's announced results date as a Medium INR event. The time is 15:30 IST (10:00 UTC), the usual close: companies rarely announce a time and
   * most report after the session, so a reaction window starts there. The id is derived from ticker and date, so a repeat write is a no-op.
   * The calendar has no source column; the date comes from the company page screener.in (the fundamentals job).
   */
  async recordCompanyResults(symbol: string, date: string): Promise<void> {
    const raw: RawEvent = { title: `${symbol.slice(symbol.indexOf(':') + 1)} results`, country: 'INR', at: new Date(`${date}T10:00:00Z`).toISOString(), impact: 'Medium', forecast: null, previous: null };
    await this.store.upsert([{ ...raw, id: this.env.id(raw) }]);
  }

  /**
   * Upcoming (and the last 6 hours, so today's releases stay visible), soonest first, each with what it measures and, once released, its actual and surprise.
   * `asOf` replays the calendar at an earlier moment: the same window around that time, and an actual stored after that moment is hidden.
   */
  async list(query: CalendarQuery, asOf?: number): Promise<EconomicEvent[]> {
    const now = asOf ?? this.env.now();
    const rows = await this.store.between(now - 6 * 3_600_000, now + query.days * 86_400_000);
    return rows.filter(e => RANK[e.impact] >= RANK[query.impact] && (!query.country || e.country === query.country))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .map(({ actualAt, ...e }) => {
        const known = actualAt == null || Date.parse(actualAt) <= now;
        return { ...e, moves: movesFor(e.country, e.title), spec: this.specs?.lookup(e.country, e.title) ?? null,
          actual: known ? e.actual ?? null : null, actualSource: known ? e.actualSource ?? null : null, surprise: known ? e.surprise ?? null : null, surpriseZ: known ? e.surpriseZ ?? null : null };
      });
  }
}
