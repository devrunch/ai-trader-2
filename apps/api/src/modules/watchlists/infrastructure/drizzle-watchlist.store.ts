import { eq, sql } from 'drizzle-orm';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { watchlists } from '../../../shared/database/schema';
import type { WatchlistStore } from '../application/watchlists';

export class DrizzleWatchlistStore implements WatchlistStore {
  constructor(private readonly db: Database) {}

  async get(userId: string): Promise<string[] | null> {
    const [row] = await withTimeout(() => this.db.select({ items: watchlists.items }).from(watchlists).where(eq(watchlists.userId, userId)), 5000);
    return row?.items ?? null;
  }

  async save(userId: string, items: string[]): Promise<void> {
    await withTimeout(() => this.db.insert(watchlists).values({ userId, items })
      .onConflictDoUpdate({ target: watchlists.userId, set: { items, updatedAt: sql`now()` } }), 5000);
  }
}
