import { and, arrayContains, desc, gte, inArray, lt } from 'drizzle-orm';
import { NEWS_IMPACTS, type NewsImpact, type NewsItem } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { newsItems } from '../../../shared/database/schema';
import type { NewsStore } from '../application/news';

export class DrizzleNewsStore implements NewsStore {
  constructor(private readonly db: Database) {}

  async insert(items: NewsItem[]): Promise<number> {
    const rows = await withTimeout(() => this.db.insert(newsItems).values(items.map(i => ({ id: i.id, source: i.source, title: i.title, url: i.url,
      summary: i.summary, publishedAt: i.publishedAt, symbols: i.symbols, impact: i.impact, moves: i.moves, direction: i.direction }))).onConflictDoNothing().returning({ id: newsItems.id }), 10_000);
    return rows.length;
  }

  async list(query: { symbol?: string | undefined; minImpact?: NewsImpact | undefined; since: number; limit: number }): Promise<NewsItem[]> {
    const since = gte(newsItems.publishedAt, new Date(query.since).toISOString());
    const filters = [since, query.symbol ? arrayContains(newsItems.symbols, [query.symbol]) : undefined,
      query.minImpact ? inArray(newsItems.impact, NEWS_IMPACTS.slice(0, NEWS_IMPACTS.indexOf(query.minImpact) + 1)) : undefined];
    const rows = await withTimeout(() => this.db.select().from(newsItems)
      .where(and(...filters))
      .orderBy(desc(newsItems.publishedAt)).limit(query.limit), 5000);
    return rows.map(r => ({ id: r.id, source: r.source, title: r.title, url: r.url, summary: r.summary,
      publishedAt: new Date(r.publishedAt).toISOString(), symbols: r.symbols, impact: r.impact, moves: r.moves, direction: r.direction }));
  }

  async prune(before: number): Promise<number> {
    const rows = await withTimeout(() => this.db.delete(newsItems).where(lt(newsItems.publishedAt, new Date(before).toISOString())).returning({ id: newsItems.id }), 10_000);
    return rows.length;
  }
}
