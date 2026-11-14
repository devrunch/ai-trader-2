import { marketsFor, type NewsCluster, NewsImpact, NewsItem, NewsItemFull, NewsMarket, Sentiment, SentimentTrend } from '@aitrader/contracts';
import { clusterNews } from '../domain/cluster';
import { summarise } from '../domain/sentiment';
import type { SentimentInput } from './sentiment';

export interface RawHeadline {
  source: string; title: string; url: string; summary: string | null; publishedAt: number;
  /** Crowd chatter (Reddit), not journalism. */ crowd?: boolean;
  /** A vendor's own sentiment, kept instead of scoring it again. */ sentiment?: Sentiment;
  /** Instruments the vendor named, added to the ones we find in the text. */ symbols?: string[];
}
/** One public feed. Resolves to its headlines; a failing feed rejects and the others still count. */
export interface NewsSource { readonly name: string; /** Markets the source covers, used when a headline names no instrument. */ readonly markets?: readonly NewsMarket[]; fetch(signal: AbortSignal): Promise<RawHeadline[]> }
export interface NewsQuery { symbol?: string | undefined; market?: NewsMarket | undefined; crowd?: boolean | undefined; minImpact?: NewsImpact | undefined; since: number; until?: number | undefined; limit: number }
export interface NewsStore {
  /** Inserts headlines not seen before (by id); returns how many were new. */
  insert(items: NewsItemFull[]): Promise<number>;
  list(query: NewsQuery): Promise<NewsItemFull[]>;
  /** Headlines with no sentiment yet, newest first. */
  unscored(limit: number): Promise<NewsItemFull[]>;
  setSentiment(verdicts: Map<string, Sentiment>): Promise<void>;
  /** Scored rows tagged with a symbol or market in a time range, for trends. */
  sentimentRows(scope: { symbol?: string | undefined; market?: NewsMarket | undefined }, since: number, until: number): Promise<Array<{ publishedAt: number; sentiment: Sentiment | null }>>;
  /** Deletes what is older than `before`, then the oldest beyond `maxRows`; returns how many went. */
  prune(before: number, maxRows: number): Promise<number>;
}
/** Scores headlines (LLM, then FinBERT, then rules). */
export interface SentimentScorer { score(items: SentimentInput[], signal: AbortSignal): Promise<Map<string, Sentiment>> }

export type Assess = (text: string, symbols: string[]) => Pick<NewsItem, 'impact' | 'moves' | 'direction'>;

const MAX_AGE_MS = 14 * 86_400_000;
/** Kept so the desk time machine has history; size-bounded so a noisy feed cannot fill the disk. */
export const RETENTION_MS = 90 * 86_400_000;
export const MAX_STORED_ITEMS = 250_000;
const SCORE_BATCH = 100;
const TREND_HOURS = [24, 168];

/** Pulls every feed, drops stale and malformed items, tags instruments, markets and impact, stores what is new, then scores sentiment (FR-NW, FR-HM-2). */
export class NewsService {
  constructor(private readonly sources: NewsSource[], private readonly store: NewsStore, private readonly tag: (text: string) => string[], private readonly assess: Assess,
    private readonly env: { now: () => number; id: (url: string) => string; warn: (message: string, detail: Record<string, unknown>) => void }, private readonly scorer: SentimentScorer | null = null) {}

  async ingest(signal: AbortSignal): Promise<{ fetched: number; stored: number; scored: number; failed: string[] }> {
    const results = await Promise.allSettled(this.sources.map(s => s.fetch(signal)));
    const failed = this.sources.filter((_, i) => results[i]?.status === 'rejected').map(s => s.name);
    for (const name of failed) this.env.warn('News feed failed', { source: name });
    const now = this.env.now();
    const seen = new Set<string>();
    const items: NewsItemFull[] = [];
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      for (const h of result.value) {
        if (!h.title.trim() || !/^https?:\/\//.test(h.url) || !Number.isFinite(h.publishedAt)) continue;
        if (h.publishedAt < now - MAX_AGE_MS || h.publishedAt > now + 3_600_000) continue;
        const id = this.env.id(h.url);
        if (seen.has(id)) continue;
        seen.add(id);
        const text = `${h.title} ${h.summary ?? ''}`;
        const symbols = [...new Set([...this.tag(text), ...(h.symbols ?? [])])];
        const assessed = this.assess(text, symbols);
        items.push({ id, source: h.source, title: h.title.trim().slice(0, 500), url: h.url, summary: h.summary?.trim().slice(0, 2000) || null,
          publishedAt: new Date(h.publishedAt).toISOString(), symbols, ...assessed, markets: marketsFor(symbols, assessed.moves, this.sources[index]?.markets ?? []),
          sentiment: h.sentiment ?? null, crowd: h.crowd ?? false });
      }
    });
    const stored = items.length ? await this.store.insert(items) : 0;
    return { fetched: items.length, stored, scored: await this.scorePending(signal), failed };
  }

  /** Scores headlines that have no sentiment yet; a failing scorer leaves them for the next pass. */
  async scorePending(signal: AbortSignal): Promise<number> {
    if (!this.scorer) return 0;
    const pending = await this.store.unscored(SCORE_BATCH);
    if (pending.length === 0) return 0;
    const verdicts = await this.scorer.score(pending.map(p => ({ id: p.id, text: `${p.title}. ${p.summary ?? ''}`.slice(0, 600) })), signal);
    await this.store.setSentiment(verdicts);
    return verdicts.size;
  }

  /** Headlines from the last `hours`; with `asOf`, only those published at or before that time (the time machine: nothing later is ever returned). */
  list(query: { symbol?: string | undefined; market?: NewsMarket | undefined; crowd?: boolean | undefined; minImpact?: NewsImpact | undefined; hours: number; limit: number; asOf?: number | undefined }): Promise<NewsItemFull[]> {
    const end = query.asOf ?? this.env.now();
    return this.store.list({ symbol: query.symbol, market: query.market, crowd: query.crowd, minImpact: query.minImpact, since: end - query.hours * 3_600_000,
      ...(query.asOf === undefined ? {} : { until: query.asOf }), limit: query.limit });
  }

  /** The same story from several sources grouped into one entry, newest first. Crowd chatter is left out unless asked for. */
  async clusters(query: Parameters<NewsService['list']>[0]): Promise<NewsCluster[]> {
    return clusterNews(await this.list({ ...query, crowd: query.crowd ?? false }));
  }

  /** One entry per story: the lead headline carrying the cluster's source count and sentiment. For watches and the desk. */
  async leads(query: Parameters<NewsService['list']>[0]): Promise<NewsItemFull[]> {
    return (await this.clusters(query)).map(c => ({ ...c.lead, sourceCount: c.sourceCount, sentiment: c.sentiment ?? c.lead.sentiment ?? null }));
  }

  /** Average sentiment over the last 24 hours and 7 days for a symbol or a market, as of `asOf` (default now). */
  async sentiment(scope: { symbol?: string | undefined; market?: NewsMarket | undefined }, asOf?: number): Promise<SentimentTrend> {
    const end = asOf ?? this.env.now();
    const rows = await this.store.sentimentRows(scope, end - Math.max(...TREND_HOURS) * 3_600_000, end);
    return summarise(scope.symbol ?? scope.market ?? 'all', rows, end, TREND_HOURS);
  }

  prune(): Promise<number> { return this.store.prune(this.env.now() - RETENTION_MS, MAX_STORED_ITEMS); }
}
