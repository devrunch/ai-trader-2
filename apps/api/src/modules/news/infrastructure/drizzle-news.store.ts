import { and, arrayContains, desc, gte, lt } from 'drizzle-orm';
import type { NewsItem } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { newsItems } from '../../../shared/database/schema';
import type { NewsStore } from '../application/news';

export class DrizzleNewsStore implements NewsStore {
  constructor(private readonly db: Database) {}

  async insert(items: NewsItem[]): Promise<number> {
    const rows = await withTimeout(() => this.db.insert(newsItems).values(items.map(i => ({ id: i.id, source: i.source, title: i.title, url: i.url,
      summary: i.summary, publishedAt: i.publishedAt, symbols: i.symbols }))).onConflictDoNothing().returning({ id: newsItems.id }), 10_000);
    return rows.length;
  }

  async list(query: { symbol?: string | undefined; since: number; limit: number }): Promise<NewsItem[]> {
    const since = gte(newsItems.publishedAt, new Date(query.since).toISOString());
    const rows = await withTimeout(() => this.db.select().from(newsItems)
      .where(query.symbol ? and(since, arrayContains(newsItems.symbols, [query.symbol])) : since)
      .orderBy(desc(newsItems.publishedAt)).limit(query.limit), 5000);
    return rows.map(r => ({ id: r.id, source: r.source, title: r.title, url: r.url, summary: r.summary,
      publishedAt: new Date(r.publishedAt).toISOString(), symbols: r.symbols }));
  }

  async prune(before: number): Promise<number> {
    const rows = await withTimeout(() => this.db.delete(newsItems).where(lt(newsItems.publishedAt, new Date(before).toISOString())).returning({ id: newsItems.id }), 10_000);
    return rows.length;
  }
}
