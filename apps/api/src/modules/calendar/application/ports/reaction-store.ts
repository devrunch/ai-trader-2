import type { EventReaction } from '@aitrader/contracts';

export interface PastRelease {
  id: string; title: string; country: string; at: string; forecast: string | null; previous: string | null;
  actual: string | null; actualAt: string | null; surprise: number | null; surpriseZ: number | null;
}
export interface DueEvent { id: string; title: string; country: string; at: string }

export interface ReactionStore {
  /** Releases of the same title (and country when given) at or before `asOf`, newest first. */
  pastReleases(query: { title: string; country?: string | undefined; asOf: number; limit: number }): Promise<PastRelease[]>;
  reactionsFor(eventIds: string[]): Promise<Map<string, EventReaction[]>>;
  /** Events with `at` in [from, to] that have no stored reaction rows. */
  withoutReactions(from: number, to: number): Promise<DueEvent[]>;
  /** Idempotent: one row per (event, symbol). */
  save(eventId: string, rows: EventReaction[], computedAt: number): Promise<void>;
}
