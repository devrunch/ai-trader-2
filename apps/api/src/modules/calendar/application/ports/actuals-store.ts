import type { EventRef } from './actuals-source';

export interface PendingEvent extends EventRef { actual: string | null; actualAt: string | null }
export interface ActualUpdate { eventId: string; actual: string; source: string; actualAt: string; surprise: number | null; surpriseZ: number | null }

export interface ActualsStore {
  /** Events with `at` in [from, to] that have no actual yet, or whose actual was stored at or after `recheckAfter` (so a correction is noticed). */
  pending(from: number, to: number, recheckAfter: number): Promise<PendingEvent[]>;
  /** The stored surprises of earlier releases of the same event (before `before`), newest first. */
  surprises(country: string, title: string, before: number, limit: number): Promise<number[]>;
  save(update: ActualUpdate): Promise<void>;
}
