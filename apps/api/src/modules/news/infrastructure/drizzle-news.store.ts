import { and, arrayContains, desc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { NEWS_IMPACTS, type NewsItemFull, type Sentiment } from '@aitrader/contracts';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { newsItems } from '../../../shared/database/schema';
import type { NewsQuery, NewsStore } from '../application/news';

type Row = typeof newsItems.$inferSelect;
const sentimentOf = (r: Pick<Row, 'sentimentLabel' | 'sentimentScore' | 'sentimentBy'>): Sentiment | null =>
  r.sentimentLabel && r.sentimentScore !== null && r.sentimentBy ? { label: r.sentimentLabel, score: r.sentimentScore, by: r.sentimentBy } : null;
const MARKETS = new Set<string>(['forex', 'india', 'us', 'commodities', 'crypto']);

const toItem = (r: Row): NewsItemFull => ({ id: r.id, source: r.source, title: r.title, url: r.url, summary: r.summary, publishedAt: new Date(r.publishedAt).toISOString(),
  symbols: r.symbols, impact: r.impact, moves: r.moves, direction: r.direction, markets: r.markets.flatMap(m => (m === 'forex' || m === 'india' || m === 'us' || m === 'commodities' || m === 'crypto' ? [m] : [])),
  sentiment: sentimentOf(r), crowd: r.crowd });

export class DrizzleNewsStore implements NewsStore {
  constructor(private readonly db: Database) {}

  async insert(items: NewsItemFull[]): Promise<number> {
    const rows = await withTimeout(() => this.db.insert(newsItems).values(items.map(i => ({ id: i.id, source: i.source, title: i.title, url: i.url,
      summary: i.summary, publishedAt: i.publishedAt, symbols: i.symbols, impact: i.impact, moves: i.moves, direction: i.direction, markets: i.markets ?? [],
      sentimentLabel: i.sentiment?.label ?? null, sentimentScore: i.sentiment?.score ?? null, sentimentBy: i.sentiment?.by ?? null, crowd: i.crowd ?? false })))
      .onConflictDoNothing().returning({ id: newsItems.id }), 10_000);
    return rows.length;
  }

  async list(query: NewsQuery): Promise<NewsItemFull[]> {
    const filters = [gte(newsItems.publishedAt, new Date(query.since).toISOString()), query.until === undefined ? undefined : lte(newsItems.publishedAt, new Date(query.until).toISOString()),
      query.symbol ? arrayContains(newsItems.symbols, [query.symbol]) : undefined, query.market ? arrayContains(newsItems.markets, [query.market]) : undefined,
      query.crowd === undefined ? undefined : eq(newsItems.crowd, query.crowd),
      query.minImpact ? inArray(newsItems.impact, NEWS_IMPACTS.slice(0, NEWS_IMPACTS.indexOf(query.minImpact) + 1)) : undefined];
    const rows = await withTimeout(() => this.db.select().from(newsItems).where(and(...filters)).orderBy(desc(newsItems.publishedAt)).limit(query.limit), 5000);
    return rows.map(toItem);
  }

  async unscored(limit: number): Promise<NewsItemFull[]> {
    const rows = await withTimeout(() => this.db.select().from(newsItems).where(isNull(newsItems.sentimentLabel)).orderBy(desc(newsItems.publishedAt)).limit(limit), 5000);
    return rows.map(toItem);
  }

  async setSentiment(verdicts: Map<string, Sentiment>): Promise<void> {
    for (const [id, s] of verdicts) {
      await withTimeout(() => this.db.update(newsItems).set({ sentimentLabel: s.label, sentimentScore: s.score, sentimentBy: s.by }).where(and(eq(newsItems.id, id), isNull(newsItems.sentimentLabel))), 5000);
    }
  }

  async sentimentRows(scope: { symbol?: string | undefined; market?: string | undefined }, since: number, until: number): Promise<Array<{ publishedAt: number; sentiment: Sentiment | null }>> {
    const filters = [gte(newsItems.publishedAt, new Date(since).toISOString()), lte(newsItems.publishedAt, new Date(until).toISOString()), eq(newsItems.crowd, false),
      scope.symbol ? arrayContains(newsItems.symbols, [scope.symbol]) : undefined, scope.market && MARKETS.has(scope.market) ? arrayContains(newsItems.markets, [scope.market]) : undefined];
    const rows = await withTimeout(() => this.db.select().from(newsItems).where(and(...filters)).limit(5000), 5000);
    return rows.map(r => ({ publishedAt: Date.parse(r.publishedAt), sentiment: sentimentOf(r) }));
  }

  async prune(before: number, maxRows: number): Promise<number> {
    const old = await withTimeout(() => this.db.delete(newsItems).where(lt(newsItems.publishedAt, new Date(before).toISOString())).returning({ id: newsItems.id }), 30_000);
    const over = await withTimeout(() => this.db.delete(newsItems).where(sql`${newsItems.id} in (select id from ${newsItems} order by ${newsItems.publishedAt} desc offset ${maxRows})`).returning({ id: newsItems.id }), 30_000);
    return old.length + over.length;
  }
}
