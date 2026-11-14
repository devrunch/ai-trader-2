import { and, desc, eq, gte, lt, lte } from 'drizzle-orm';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { Database } from '../../../shared/database';
import { optionSnapshots } from '../../../shared/database/schema';
import type { OptionSnapshot, OptionSnapshotStore } from '../application/ports/options-ports';

const Legs = z.array(z.strictObject({ symbol: z.string(), strike: z.number(), type: z.enum(['CE', 'PE']), ltp: z.number().nullable(), oi: z.number().nullable(), volume: z.number().nullable() }));
const iso = (ms: number): string => new Date(ms).toISOString();

export class DrizzleOptionSnapshotStore implements OptionSnapshotStore {
  constructor(private readonly db: Database) {}

  /** Idempotent: the primary key is (underlying, expiry, taken_at), so a repeat write of the same snapshot does nothing. */
  async save(s: OptionSnapshot): Promise<void> {
    await withTimeout(() => this.db.insert(optionSnapshots).values({ underlying: s.underlying, expiry: s.expiry, takenAt: iso(s.takenAt), spot: s.spot, legs: s.legs }).onConflictDoNothing(), 10_000);
  }

  latest(underlying: string, expiry: string, atMost: number): Promise<OptionSnapshot | null> {
    return this.newest(underlying, expiry, lte(optionSnapshots.takenAt, iso(atMost)));
  }

  before(underlying: string, expiry: string, before: number): Promise<OptionSnapshot | null> {
    return this.newest(underlying, expiry, lt(optionSnapshots.takenAt, iso(before)));
  }

  async recentUnderlyings(since: number): Promise<string[]> {
    const rows = await withTimeout(() => this.db.selectDistinct({ underlying: optionSnapshots.underlying }).from(optionSnapshots).where(gte(optionSnapshots.takenAt, iso(since))), 10_000);
    return rows.map(r => r.underlying);
  }

  async purge(before: number): Promise<number> {
    const rows = await withTimeout(() => this.db.delete(optionSnapshots).where(lt(optionSnapshots.takenAt, iso(before))).returning({ at: optionSnapshots.takenAt }), 10_000);
    return rows.length;
  }

  private async newest(underlying: string, expiry: string, bound: ReturnType<typeof lte>): Promise<OptionSnapshot | null> {
    const [row] = await withTimeout(() => this.db.select().from(optionSnapshots)
      .where(and(eq(optionSnapshots.underlying, underlying), eq(optionSnapshots.expiry, expiry), bound)).orderBy(desc(optionSnapshots.takenAt)).limit(1), 5000);
    return row ? { underlying: row.underlying, expiry: row.expiry, takenAt: Date.parse(row.takenAt), spot: row.spot, legs: Legs.parse(row.legs) } : null;
  }
}
