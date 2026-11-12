import { and, desc, eq, sql } from 'drizzle-orm';
import { BacktestSpecSchema } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { strategies } from '../../../shared/database/schema';
import type { StoredStrategy, StrategyStore } from '../application/strategies';

type Row = typeof strategies.$inferSelect;
const toStored = (r: Row): StoredStrategy => ({ id: r.id, userId: r.userId, name: r.name, spec: BacktestSpecSchema.parse(r.spec), variantHashes: r.variantHashes,
  createdAt: new Date(r.createdAt).toISOString(), updatedAt: new Date(r.updatedAt).toISOString() });
const mine = (userId: string, id: string) => and(eq(strategies.userId, userId), eq(strategies.id, id));

export class DrizzleStrategyStore implements StrategyStore {
  constructor(private readonly db: Database) {}

  async list(userId: string): Promise<StoredStrategy[]> {
    return (await withTimeout(() => this.db.select().from(strategies).where(eq(strategies.userId, userId)).orderBy(desc(strategies.updatedAt)).limit(100), 5000)).map(toStored);
  }

  async get(userId: string, id: string): Promise<StoredStrategy | null> {
    const [row] = await withTimeout(() => this.db.select().from(strategies).where(mine(userId, id)), 5000);
    return row ? toStored(row) : null;
  }

  async count(userId: string): Promise<number> {
    const [row] = await withTimeout(() => this.db.select({ n: sql<number>`count(*)::int` }).from(strategies).where(eq(strategies.userId, userId)), 5000);
    return row?.n ?? 0;
  }

  async insert(row: StoredStrategy): Promise<void> {
    await withTimeout(() => this.db.insert(strategies).values({ id: row.id, userId: row.userId, name: row.name, spec: row.spec, variantHashes: row.variantHashes,
      createdAt: row.createdAt, updatedAt: row.updatedAt }), 5000);
  }

  async update(userId: string, id: string, patch: { name?: string | undefined; spec?: StoredStrategy['spec'] | undefined; updatedAt: string }): Promise<boolean> {
    const rows = await withTimeout(() => this.db.update(strategies).set({ updatedAt: patch.updatedAt, ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.spec === undefined ? {} : { spec: patch.spec }) }).where(mine(userId, id)).returning({ id: strategies.id }), 5000);
    return rows.length > 0;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    return (await withTimeout(() => this.db.delete(strategies).where(mine(userId, id)).returning({ id: strategies.id }), 5000)).length > 0;
  }

  /** One statement: adds the hash only when absent, so concurrent runs of the same parameters count once. */
  async addVariant(userId: string, id: string, hash: string): Promise<number | null> {
    const [row] = await withTimeout(() => this.db.update(strategies).set({
      variantHashes: sql`case when ${hash} = any(${strategies.variantHashes}) then ${strategies.variantHashes} else array_append(${strategies.variantHashes}, ${hash}) end`,
    }).where(mine(userId, id)).returning({ variants: sql<number>`cardinality(${strategies.variantHashes})::int` }), 5000);
    return row?.variants ?? null;
  }
}
