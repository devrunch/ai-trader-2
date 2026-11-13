import { and, eq, inArray, sql } from 'drizzle-orm';
import { withTimeout } from '@aitrader/resilience';
import { z } from 'zod';
import type { Database } from '../../../shared/database/index.js';
import { instrumentMappings, instruments, universeConstituents } from '../../../shared/database/schema/index.js';
import type { StoredConstituents, UniverseStore } from '../application/ports/universe-store.js';

const MembersSchema = z.array(z.object({ id: z.string(), name: z.string() }));
const TIMEOUT_MS = 10_000;

export class DrizzleUniverseStore implements UniverseStore {
  constructor(private readonly db: Database) {}

  async get(indexId: string): Promise<StoredConstituents | null> {
    const [row] = await withTimeout(() => this.db.select().from(universeConstituents).where(eq(universeConstituents.indexId, indexId)).limit(1), TIMEOUT_MS);
    return row ? { members: MembersSchema.parse(row.members), listDate: row.listDate, fetchedAt: row.fetchedAt } : null;
  }

  // Keyed by index: saving the same list twice just rewrites the row.
  async save(indexId: string, value: StoredConstituents, source: string): Promise<void> {
    const fields = { members: value.members, listDate: value.listDate, fetchedAt: value.fetchedAt, source };
    await withTimeout(() => this.db.insert(universeConstituents).values({ indexId, ...fields })
      .onConflictDoUpdate({ target: universeConstituents.indexId, set: fields }), TIMEOUT_MS);
  }

  async pricedAmong(ids: readonly string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = await withTimeout(() => this.db.selectDistinct({ id: instruments.id }).from(instruments)
      .innerJoin(instrumentMappings, eq(instrumentMappings.id, instruments.id))
      .where(and(inArray(instruments.id, [...ids]), eq(instruments.status, 'active'), sql`${instrumentMappings.provider} in ('kite', 'deriv', 'us-delayed')`)), TIMEOUT_MS);
    return new Set(rows.map(r => r.id));
  }
}
