import { and, desc, eq, gte, inArray, lte, notExists, sql } from 'drizzle-orm';
import type { EventReaction } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { economicEvents, eventReactions } from '../../../shared/database/schema';
import type { DueEvent, PastRelease, ReactionStore } from '../application/ports/reaction-store';

const TIMEOUT_MS = 8000;
const iso = (ms: number): string => new Date(ms).toISOString();

export class DrizzleReactionStore implements ReactionStore {
  constructor(private readonly db: Database) {}

  async pastReleases(q: { title: string; country?: string | undefined; asOf: number; limit: number }): Promise<PastRelease[]> {
    const rows = await withTimeout(() => this.db.select().from(economicEvents)
      .where(and(eq(economicEvents.title, q.title), q.country ? eq(economicEvents.country, q.country) : undefined, lte(economicEvents.at, iso(q.asOf))))
      .orderBy(desc(economicEvents.at)).limit(q.limit), TIMEOUT_MS);
    return rows.map(r => ({ id: r.id, title: r.title, country: r.country, at: iso(Date.parse(r.at)), forecast: r.forecast, previous: r.previous,
      actual: r.actual, actualAt: r.actualAt ? iso(Date.parse(r.actualAt)) : null, surprise: r.surprise, surpriseZ: r.surpriseZ }));
  }

  async reactionsFor(eventIds: string[]): Promise<Map<string, EventReaction[]>> {
    const out = new Map<string, EventReaction[]>();
    if (eventIds.length === 0) return out;
    const rows = await withTimeout(() => this.db.select().from(eventReactions).where(inArray(eventReactions.eventId, eventIds)).orderBy(eventReactions.symbol), TIMEOUT_MS);
    for (const r of rows) {
      const list = out.get(r.eventId) ?? [];
      list.push({ symbol: r.symbol, refPrice: r.refPrice, move5Pct: r.move5Pct, move15Pct: r.move15Pct, move60Pct: r.move60Pct });
      out.set(r.eventId, list);
    }
    return out;
  }

  async withoutReactions(from: number, to: number): Promise<DueEvent[]> {
    const rows = await withTimeout(() => this.db.select({ id: economicEvents.id, title: economicEvents.title, country: economicEvents.country, at: economicEvents.at }).from(economicEvents)
      .where(and(gte(economicEvents.at, iso(from)), lte(economicEvents.at, iso(to)),
        notExists(this.db.select({ one: sql`1` }).from(eventReactions).where(eq(eventReactions.eventId, economicEvents.id))))).orderBy(economicEvents.at), TIMEOUT_MS);
    return rows.map(r => ({ ...r, at: iso(Date.parse(r.at)) }));
  }

  async save(eventId: string, rows: EventReaction[], computedAt: number): Promise<void> {
    if (rows.length === 0) return;
    await withTimeout(() => this.db.insert(eventReactions).values(rows.map(r => ({ eventId, ...r, computedAt: iso(computedAt) }))).onConflictDoNothing(), TIMEOUT_MS);
  }
}
