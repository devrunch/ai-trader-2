import { surprise as computeSurprise, surpriseZ } from '../domain/release-value';
import type { ActualsSource } from './ports/actuals-source';
import type { ActualsStore, PendingEvent } from './ports/actuals-store';

const MINUTE = 60_000;
const HOUR = 3_600_000;
/** A source may correct a value it gave within the last day. */
const CORRECTION_WINDOW_MS = 24 * HOUR;
/** An event stays in the poll for this long after its actual was stored, to catch an immediate correction. */
const RECHECK_MS = 15 * MINUTE;
const HISTORY = 60;

export interface CaptureWindow { behindMs: number; aheadMs: number }
export interface CaptureEnv { now: () => number; log: (message: string, data: Record<string, unknown>) => void }

/**
 * Stores the released value of each due event and the surprise against its forecast.
 * Idempotent: an event that already has an actual is only rewritten when the source reports a different value within a day of storing it (logged); the same value again changes nothing.
 */
export class CaptureActuals {
  constructor(private readonly sources: readonly ActualsSource[], private readonly store: ActualsStore, private readonly env: CaptureEnv) {}

  /** Asks the sources, in priority order, about events released in the window (by default the last 6 hours); returns how many actuals were stored or corrected. */
  async run(signal: AbortSignal, window: CaptureWindow = { behindMs: 6 * HOUR, aheadMs: 0 }): Promise<number> {
    const now = this.env.now();
    const pending = await this.store.pending(now - window.behindMs, now + window.aheadMs, now - RECHECK_MS);
    if (pending.length === 0) return 0;
    const byId = new Map(pending.map(e => [e.id, e]));
    const refs = pending.map(e => ({ id: e.id, title: e.title, country: e.country, at: e.at, forecast: e.forecast, previous: e.previous }));
    const settled = await Promise.allSettled(this.sources.map(s => s.fetch(refs, signal)));
    let changed = 0;
    const seen = new Set<string>();
    for (const result of settled) {
      if (result.status === 'rejected') { this.env.log('actuals source failed', { error: result.reason instanceof Error ? result.reason.message : 'unknown' }); continue; }
      for (const observation of result.value) {
        const event = byId.get(observation.eventId);
        if (!event || seen.has(event.id)) continue;
        seen.add(event.id);
        if (await this.apply(event, observation, now)) changed++;
      }
    }
    return changed;
  }

  private async apply(event: PendingEvent, observation: { actual: string; source: string }, now: number): Promise<boolean> {
    const actual = observation.actual.trim();
    if (!actual || actual === event.actual) return false;
    if (event.actual !== null) {
      const age = now - Date.parse(event.actualAt ?? '');
      if (!(age <= CORRECTION_WINDOW_MS)) return false;
      this.env.log('actual corrected by the source', { eventId: event.id, title: event.title, was: event.actual, now: actual, source: observation.source });
    }
    const value = computeSurprise(actual, event.forecast);
    const history = await this.store.surprises(event.country, event.title, Date.parse(event.at), HISTORY);
    await this.store.save({ eventId: event.id, actual, source: observation.source, actualAt: new Date(now).toISOString(), surprise: value, surpriseZ: surpriseZ(value, history) });
    return true;
  }
}
