import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { BacktestSpecSchema } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { strategies } from '../../../shared/database/schema';
import { DrizzleSpecStore, savedSpecRow } from '../../../shared/saved-specs';
import type { StoredStrategy, StrategyStore } from '../application/strategies';

const rowSchema = savedSpecRow.extend({ spec: BacktestSpecSchema, variantHashes: z.array(z.string()) });

export class DrizzleStrategyStore extends DrizzleSpecStore<StoredStrategy['spec'], StoredStrategy> implements StrategyStore {
  constructor(db: Database) { super(db, strategies, row => rowSchema.parse(row)); }

  /** One statement: adds the hash only when absent, so concurrent runs of the same parameters count once. */
  async addVariant(userId: string, id: string, hash: string): Promise<number | null> {
    const [row] = await withTimeout(() => this.db.update(strategies).set({
      variantHashes: sql`case when ${hash} = any(${strategies.variantHashes}) then ${strategies.variantHashes} else array_append(${strategies.variantHashes}, ${hash}) end`,
    }).where(this.mine(userId, id)).returning({ variants: sql<number>`cardinality(${strategies.variantHashes})::int` }), 5000);
    return row?.variants ?? null;
  }
}
