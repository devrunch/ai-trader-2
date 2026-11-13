import { and, desc, eq, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../database';
import type { SpecPatch, SpecStore, StoredSpec } from './saved-specs';

/** A table built from `savedSpecColumns`. */
export type SpecTable = PgTable & { id: PgColumn; userId: PgColumn; name: PgColumn; spec: PgColumn; updatedAt: PgColumn };

/** Postgres store for a per-user saved spec table; every query is scoped to the owner and bounded by a timeout. */
export class DrizzleSpecStore<S, R extends StoredSpec<S>> implements SpecStore<S, R> {
  constructor(protected readonly db: Database, protected readonly table: SpecTable, private readonly fromRow: (row: Record<string, unknown>) => R) {}

  protected mine(userId: string, id: string): ReturnType<typeof and> { return and(eq(this.table.userId, userId), eq(this.table.id, id)); }

  async list(userId: string): Promise<R[]> {
    return (await withTimeout(() => this.db.select().from(this.table).where(eq(this.table.userId, userId)).orderBy(desc(this.table.updatedAt)).limit(100), 5000)).map(this.fromRow);
  }

  async get(userId: string, id: string): Promise<R | null> {
    const [row] = await withTimeout(() => this.db.select().from(this.table).where(this.mine(userId, id)), 5000);
    return row ? this.fromRow(row) : null;
  }

  async count(userId: string): Promise<number> {
    const [row] = await withTimeout(() => this.db.select({ n: sql<number>`count(*)::int` }).from(this.table).where(eq(this.table.userId, userId)), 5000);
    return row?.n ?? 0;
  }

  async insert(row: R): Promise<void> {
    await withTimeout(() => this.db.insert(this.table).values(row), 5000);
  }

  async update(userId: string, id: string, patch: SpecPatch<S>): Promise<boolean> {
    const rows = await withTimeout(() => this.db.update(this.table).set({ updatedAt: patch.updatedAt, ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.spec === undefined ? {} : { spec: patch.spec }) }).where(this.mine(userId, id)).returning({ id: this.table.id }), 5000);
    return rows.length > 0;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    return (await withTimeout(() => this.db.delete(this.table).where(this.mine(userId, id)).returning({ id: this.table.id }), 5000)).length > 0;
  }
}
