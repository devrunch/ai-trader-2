import { and, gte, lte, sql } from 'drizzle-orm';
import type { EconomicEvent } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { Database } from '../../../shared/database';
import { economicEvents } from '../../../shared/database/schema';
import type { CalendarStore } from '../application/calendar';

const Impact = z.enum(['High', 'Medium', 'Low', 'Holiday']);

export class DrizzleCalendarStore implements CalendarStore {
  constructor(private readonly db: Database) {}

  async upsert(events: Array<Omit<EconomicEvent, 'moves'>>): Promise<void> {
    if (events.length === 0) return;
    await withTimeout(() => this.db.insert(economicEvents).values(events.map(e => ({ ...e, updatedAt: new Date().toISOString() })))
      .onConflictDoUpdate({ target: economicEvents.id, set: { forecast: sql`excluded.forecast`, previous: sql`excluded.previous`, impact: sql`excluded.impact`, updatedAt: sql`now()` } }), 10_000);
  }

  async between(from: number, to: number): Promise<Array<Omit<EconomicEvent, 'moves'>>> {
    const rows = await withTimeout(() => this.db.select().from(economicEvents)
      .where(and(gte(economicEvents.at, new Date(from).toISOString()), lte(economicEvents.at, new Date(to).toISOString()))), 5000);
    return rows.map(r => ({ id: r.id, title: r.title, country: r.country, at: new Date(r.at).toISOString(), impact: Impact.parse(r.impact), forecast: r.forecast, previous: r.previous }));
  }
}
