import type { NewsImpact, NewsItem } from '@aitrader/contracts';

export interface RawHeadline { source: string; title: string; url: string; summary: string | null; publishedAt: number }
/** One public feed. Resolves to its headlines; a failing feed rejects and the others still count. */
export interface NewsSource { readonly name: string; fetch(signal: AbortSignal): Promise<RawHeadline[]> }
export interface NewsStore {
  /** Inserts headlines not seen before (by id); returns how many were new. */
  insert(items: NewsItem[]): Promise<number>;
  list(query: { symbol?: string | undefined; minImpact?: NewsImpact | undefined; since: number; until?: number | undefined; limit: number }): Promise<NewsItem[]>;
  prune(before: number): Promise<number>;
}

export type Assess = (text: string, symbols: string[]) => Pick<NewsItem, 'impact' | 'moves' | 'direction'>;

const MAX_AGE_MS = 14 * 86_400_000;

/** Pulls every feed, drops stale and malformed items, tags instruments and impact, stores what is new (FR-NW). */
export class NewsService {
  constructor(private readonly sources: NewsSource[], private readonly store: NewsStore, private readonly tag: (text: string) => string[], private readonly assess: Assess,
    private readonly env: { now: () => number; id: (url: string) => string; warn: (message: string, detail: Record<string, unknown>) => void }) {}

  async ingest(signal: AbortSignal): Promise<{ fetched: number; stored: number; failed: string[] }> {
    const results = await Promise.allSettled(this.sources.map(s => s.fetch(signal)));
    const failed = this.sources.filter((_, i) => results[i]?.status === 'rejected').map(s => s.name);
    for (const name of failed) this.env.warn('News feed failed', { source: name });
    const now = this.env.now();
    const seen = new Set<string>();
    const items: NewsItem[] = [];
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const h of result.value) {
        if (!h.title.trim() || !/^https?:\/\//.test(h.url) || !Number.isFinite(h.publishedAt)) continue;
        if (h.publishedAt < now - MAX_AGE_MS || h.publishedAt > now + 3_600_000) continue;
        const id = this.env.id(h.url);
        if (seen.has(id)) continue;
        seen.add(id);
        const text = `${h.title} ${h.summary ?? ''}`;
        const symbols = this.tag(text);
        items.push({ id, source: h.source, title: h.title.trim().slice(0, 500), url: h.url, summary: h.summary?.trim().slice(0, 2000) || null,
          publishedAt: new Date(h.publishedAt).toISOString(), symbols, ...this.assess(text, symbols) });
      }
    }
    return { fetched: items.length, stored: items.length ? await this.store.insert(items) : 0, failed };
  }

  /** Headlines from the last `hours`; with `asOf`, only those published at or before that time (the time machine: nothing later is ever returned). */
  list(query: { symbol?: string | undefined; minImpact?: NewsImpact | undefined; hours: number; limit: number; asOf?: number | undefined }): Promise<NewsItem[]> {
    const end = query.asOf ?? this.env.now();
    return this.store.list({ symbol: query.symbol, minImpact: query.minImpact, since: end - query.hours * 3_600_000, ...(query.asOf === undefined ? {} : { until: query.asOf }), limit: query.limit });
  }

  prune(): Promise<number> { return this.store.prune(this.env.now() - MAX_AGE_MS); }
}
