import { and, desc, eq, gte, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { Database } from '../../../shared/database';
import { economicEvents } from '../../../shared/database/schema';
import type { CalendarStore, StoredEvent } from '../application/calendar';
import type { ActualUpdate, ActualsStore, PendingEvent } from '../application/ports/actuals-store';
import type { EconomicEvent } from '@aitrader/contracts';

const Impact = z.enum(['High', 'Medium', 'Low', 'Holiday']);
const iso = (value: string): string => new Date(value).toISOString();

export class DrizzleCalendarStore implements CalendarStore, ActualsStore {
  constructor(private readonly db: Database) {}

  /** Refreshing the schedule rewrites only forecast, previous and impact: a stored actual and its surprise survive. */
  async upsert(events: Array<Omit<EconomicEvent, 'moves'>>): Promise<void> {
    if (events.length === 0) return;
    const rows = events.map(e => ({ id: e.id, title: e.title, country: e.country, at: e.at, impact: e.impact, forecast: e.forecast, previous: e.previous, updatedAt: new Date().toISOString() }));
    await withTimeout(() => this.db.insert(economicEvents).values(rows)
      .onConflictDoUpdate({ target: economicEvents.id, set: { forecast: sql`excluded.forecast`, previous: sql`excluded.previous`, impact: sql`excluded.impact`, updatedAt: sql`now()` } }), 10_000);
  }

  async between(from: number, to: number): Promise<StoredEvent[]> {
    const rows = await withTimeout(() => this.db.select().from(economicEvents)
      .where(and(gte(economicEvents.at, new Date(from).toISOString()), lte(economicEvents.at, new Date(to).toISOString()))), 5000);
    return rows.map(r => ({ id: r.id, title: r.title, country: r.country, at: iso(r.at), impact: Impact.parse(r.impact), forecast: r.forecast, previous: r.previous,
      actual: r.actual, actualSource: r.actualSource, actualAt: r.actualAt === null ? null : iso(r.actualAt), surprise: r.surprise, surpriseZ: r.surpriseZ }));
  }

  async pending(from: number, to: number, recheckAfter: number): Promise<PendingEvent[]> {
    const rows = await withTimeout(() => this.db.select().from(economicEvents)
      .where(and(gte(economicEvents.at, new Date(from).toISOString()), lte(economicEvents.at, new Date(to).toISOString()),
        or(isNull(economicEvents.actual), gte(economicEvents.actualAt, new Date(recheckAfter).toISOString())))), 5000);
    return rows.map(r => ({ id: r.id, title: r.title, country: r.country, at: iso(r.at), forecast: r.forecast, previous: r.previous, actual: r.actual, actualAt: r.actualAt === null ? null : iso(r.actualAt) }));
  }

  async surprises(country: string, title: string, before: number, limit: number): Promise<number[]> {
    const rows = await withTimeout(() => this.db.select({ surprise: economicEvents.surprise }).from(economicEvents)
      .where(and(eq(economicEvents.country, country), eq(economicEvents.title, title), lt(economicEvents.at, new Date(before).toISOString()), isNotNull(economicEvents.surprise)))
      .orderBy(desc(economicEvents.at)).limit(limit), 5000);
    return rows.flatMap(r => (r.surprise === null ? [] : [r.surprise]));
  }

  async save(update: ActualUpdate): Promise<void> {
    await withTimeout(() => this.db.update(economicEvents).set({ actual: update.actual, actualSource: update.source, actualAt: update.actualAt, surprise: update.surprise, surpriseZ: update.surpriseZ })
      .where(eq(economicEvents.id, update.eventId)), 5000);
  }
}
