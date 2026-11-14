import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { WatchItemSchema } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { whatToWatch } from '../../../shared/database/schema';
import type { StoredWatch, WatchStore } from '../application/what-to-watch';

const Items = z.array(WatchItemSchema);
const toList = (r: typeof whatToWatch.$inferSelect): StoredWatch => ({ id: r.id, createdAt: Date.parse(r.createdAt), items: Items.parse(r.items) });

export class DrizzleWhatToWatchStore implements WatchStore {
  constructor(private readonly db: Database) {}

  async latest(userId: string): Promise<StoredWatch | null> {
    const [row] = await withTimeout(() => this.db.select().from(whatToWatch).where(eq(whatToWatch.userId, userId)).orderBy(desc(whatToWatch.createdAt)).limit(1), 5000);
    return row ? toList(row) : null;
  }

  async recent(userId: string, limit: number): Promise<StoredWatch[]> {
    const rows = await withTimeout(() => this.db.select().from(whatToWatch).where(eq(whatToWatch.userId, userId)).orderBy(desc(whatToWatch.createdAt)).limit(limit), 5000);
    return rows.map(toList);
  }

  async save(userId: string, list: StoredWatch): Promise<void> {
    const open = list.items.some(i => i.outcome === 'open');
    await withTimeout(() => this.db.insert(whatToWatch).values({ id: list.id, userId, createdAt: new Date(list.createdAt).toISOString(), items: list.items, open })
      .onConflictDoUpdate({ target: whatToWatch.id, set: { items: list.items, open } }), 5000);
  }

  async open(limit: number): Promise<Array<{ userId: string; list: StoredWatch }>> {
    const rows = await withTimeout(() => this.db.select().from(whatToWatch).where(and(eq(whatToWatch.open, true))).orderBy(desc(whatToWatch.createdAt)).limit(limit), 5000);
    return rows.map(r => ({ userId: r.userId, list: toList(r) }));
  }
}
