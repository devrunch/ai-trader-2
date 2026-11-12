import { and, desc, eq, lte, sql } from 'drizzle-orm';
import type { PineScriptSummary, PineScriptVersion } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { pineScriptVersions, pineScripts, users } from '../../../shared/database/schema';
import type { PineScriptStore, StoredScript } from '../application/pine-scripts';

const TIMEOUT_MS = 5000;
type Executor = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;
const iso = (value: string): string => new Date(value).toISOString();

export class DrizzlePineScriptStore implements PineScriptStore {
  constructor(private readonly db: Database, private readonly x: Executor = db) {}

  async list(userId: string): Promise<PineScriptSummary[]> {
    const latest = this.x.select({ scriptId: pineScriptVersions.scriptId, version: sql<number>`max(${pineScriptVersions.version})`.as('version') })
      .from(pineScriptVersions).groupBy(pineScriptVersions.scriptId).as('latest');
    const rows = await withTimeout(() => this.x.select({ id: pineScripts.id, name: pineScripts.name, updatedAt: pineScripts.updatedAt, version: pineScriptVersions.version, hash: pineScriptVersions.sourceHash })
      .from(pineScripts).innerJoin(latest, eq(latest.scriptId, pineScripts.id))
      .innerJoin(pineScriptVersions, and(eq(pineScriptVersions.scriptId, latest.scriptId), eq(pineScriptVersions.version, latest.version)))
      .where(eq(pineScripts.userId, userId)).orderBy(desc(pineScripts.updatedAt)), TIMEOUT_MS);
    return rows.map(r => ({ id: r.id, name: r.name, currentVersion: r.version, sourceHash: r.hash, updatedAt: iso(r.updatedAt) }));
  }

  atomically<T>(fn: (store: PineScriptStore) => Promise<T>): Promise<T> {
    return withTimeout(() => this.db.transaction(tx => fn(new DrizzlePineScriptStore(this.db, tx))), TIMEOUT_MS * 3);
  }

  async lockUser(userId: string): Promise<void> {
    await withTimeout(() => this.x.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update'), TIMEOUT_MS);
  }

  async count(userId: string): Promise<number> {
    const [row] = await withTimeout(() => this.x.select({ n: sql<number>`count(*)::int` }).from(pineScripts).where(eq(pineScripts.userId, userId)), TIMEOUT_MS);
    return row?.n ?? 0;
  }

  async insertScript(row: StoredScript & { userId: string }): Promise<void> {
    await withTimeout(() => this.x.insert(pineScripts).values({ id: row.id, userId: row.userId, name: row.name, createdAt: row.updatedAt, updatedAt: row.updatedAt }), TIMEOUT_MS);
  }

  async find(userId: string, id: string, lock = false): Promise<StoredScript | null> {
    const query = this.x.select({ id: pineScripts.id, name: pineScripts.name, updatedAt: pineScripts.updatedAt }).from(pineScripts)
      .where(and(eq(pineScripts.id, id), eq(pineScripts.userId, userId)));
    const [row] = await withTimeout(() => (lock ? query.for('update') : query), TIMEOUT_MS);
    return row ? { id: row.id, name: row.name, updatedAt: iso(row.updatedAt) } : null;
  }

  async versions(scriptId: string): Promise<PineScriptVersion[]> {
    const rows = await withTimeout(() => this.x.select({ version: pineScriptVersions.version, sourceHash: pineScriptVersions.sourceHash, createdAt: pineScriptVersions.createdAt })
      .from(pineScriptVersions).where(eq(pineScriptVersions.scriptId, scriptId)).orderBy(desc(pineScriptVersions.version)), TIMEOUT_MS);
    return rows.map(r => ({ ...r, createdAt: iso(r.createdAt) }));
  }

  async source(scriptId: string, version: number): Promise<string | null> {
    const [row] = await withTimeout(() => this.x.select({ source: pineScriptVersions.source }).from(pineScriptVersions)
      .where(and(eq(pineScriptVersions.scriptId, scriptId), eq(pineScriptVersions.version, version))), TIMEOUT_MS);
    return row?.source ?? null;
  }

  // The (script_id, version) primary key rejects a duplicate number if two saves ever raced past the row lock.
  async addVersion(scriptId: string, row: PineScriptVersion & { source: string }): Promise<void> {
    await withTimeout(() => this.x.insert(pineScriptVersions).values({ scriptId, version: row.version, source: row.source, sourceHash: row.sourceHash, createdAt: row.createdAt }), TIMEOUT_MS);
  }

  async dropVersionsUpTo(scriptId: string, version: number): Promise<void> {
    if (version <= 0) return;
    await withTimeout(() => this.x.delete(pineScriptVersions).where(and(eq(pineScriptVersions.scriptId, scriptId), lte(pineScriptVersions.version, version))), TIMEOUT_MS);
  }

  async touch(scriptId: string, name: string | undefined, at: string): Promise<void> {
    await withTimeout(() => this.x.update(pineScripts).set(name === undefined ? { updatedAt: at } : { name, updatedAt: at }).where(eq(pineScripts.id, scriptId)), TIMEOUT_MS);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const rows = await withTimeout(() => this.x.delete(pineScripts).where(and(eq(pineScripts.id, id), eq(pineScripts.userId, userId))).returning({ id: pineScripts.id }), TIMEOUT_MS);
    return rows.length > 0;
  }
}
