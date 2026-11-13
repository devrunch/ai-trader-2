import type { EventReaction, EventScorecard, EventSpec } from '@aitrader/contracts';
import { reactionAsOf } from '../domain/reaction';
import { scorecardStats } from '../domain/scorecard-stats';
import type { PastRelease, ReactionStore } from './ports/reaction-store';

export interface ScorecardQuery { title: string; country?: string | undefined; limit: number; asOf?: number | undefined }

/** How an event's past releases moved each instrument; nothing dated or computed after `asOf` is shown. */
export class EventScorecards {
  constructor(private readonly store: ReactionStore, private readonly specFor: (title: string, country: string) => EventSpec | null, private readonly clock: () => number = Date.now) {}

  async get(query: ScorecardQuery): Promise<EventScorecard | null> {
    const asOf = query.asOf ?? this.clock();
    const rows = await this.store.pastReleases({ title: query.title, country: query.country, asOf, limit: query.limit });
    if (rows.length === 0) return null;
    return this.build(query.title, query.country ?? rows[0]?.country ?? '', rows, await this.store.reactionsFor(rows.map(r => r.id)), asOf);
  }

  /** Adds stored reactions to events already released at `asOf` (default now), hiding horizons not yet passed. */
  async withReactions<T extends { id: string; at: string }>(events: T[], asOf?: number): Promise<Array<T & { reactions?: EventReaction[] }>> {
    const now = asOf ?? this.clock();
    const stored = await this.store.reactionsFor(events.filter(e => Date.parse(e.at) <= now).map(e => e.id));
    return events.map(e => {
      const rows = stored.get(e.id);
      return rows ? { ...e, reactions: rows.map(x => ({ ...x, ...reactionAsOf(x, Date.parse(e.at), now) })) } : e;
    });
  }

  async forEvents(events: Array<{ id: string; title: string; country: string }>, limit: number, asOf?: number): Promise<Map<string, EventScorecard>> {
    const out = new Map<string, EventScorecard>();
    const byKey = new Map<string, EventScorecard | null>();
    for (const e of events) {
      const key = `${e.country}|${e.title}`;
      if (!byKey.has(key)) byKey.set(key, await this.get({ title: e.title, country: e.country, limit, asOf }));
      const card = byKey.get(key);
      if (card) out.set(e.id, card);
    }
    return out;
  }

  private build(title: string, country: string, rows: PastRelease[], reactions: Map<string, EventReaction[]>, asOf: number): EventScorecard {
    const releases = rows.map(r => {
      // A value captured after `asOf` was not known then.
      const known = r.actualAt === null ? r.actual === null : Date.parse(r.actualAt) <= asOf;
      const releaseAt = Date.parse(r.at);
      return { eventId: r.id, at: r.at, forecast: r.forecast, previous: r.previous, actual: known ? r.actual : null,
        surprise: known ? r.surprise : null, surpriseZ: known ? r.surpriseZ : null,
        reactions: (reactions.get(r.id) ?? []).map(x => ({ ...x, ...reactionAsOf(x, releaseAt, asOf) })) };
    });
    return { title, country, spec: this.specFor(title, country), releases, stats: scorecardStats(releases) };
  }
}
