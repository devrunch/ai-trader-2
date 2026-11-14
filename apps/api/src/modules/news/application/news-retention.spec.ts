import { describe, expect, it, vi } from 'vitest';
import type { NewsItemFull, Sentiment } from '@aitrader/contracts';
import { tagger } from '../domain/tagging';
import { MAX_STORED_ITEMS, NewsService, RETENTION_MS, type NewsSource } from './news';

const now = Date.parse('2026-11-12T04:00:00Z');
const assess = () => ({ impact: 'low' as const, moves: [], direction: null });
const item = (id: string, source: string, title: string, minAgo: number, sentiment: Sentiment | null = null): NewsItemFull => ({ id, source, title, url: `https://x.test/${id}`, summary: null,
  publishedAt: new Date(now - minAgo * 60_000).toISOString(), symbols: [], impact: 'low', moves: [], direction: null, markets: ['india'], sentiment });
function store(rows: NewsItemFull[] = []) {
  const set = new Map<string, Sentiment>();
  return { set, insert: vi.fn((items: NewsItemFull[]) => Promise.resolve(items.length)), list: vi.fn(() => Promise.resolve(rows)), unscored: vi.fn(() => Promise.resolve(rows.filter(r => !r.sentiment))),
    setSentiment: vi.fn((m: Map<string, Sentiment>) => { for (const [k, v] of m) set.set(k, v); return Promise.resolve(); }), sentimentRows: vi.fn((): Promise<Array<{ publishedAt: number; sentiment: Sentiment | null }>> => Promise.resolve([])), prune: vi.fn(() => Promise.resolve(0)) };
}
const env = { now: () => now, id: (u: string) => u, warn: vi.fn() };

describe('NewsService retention', () => {
  it('keeps 90 days and at most the row cap, so the desk time machine has history', async () => {
    const s = store();
    await new NewsService([], s, tagger(), assess, env).prune();
    expect(RETENTION_MS).toBe(90 * 86_400_000);
    expect(s.prune).toHaveBeenCalledWith(now - 90 * 86_400_000, MAX_STORED_ITEMS);
  });
  it('still refuses to ingest headlines older than two weeks', async () => {
    const old: NewsSource = { name: 'old', fetch: () => Promise.resolve([{ source: 'old', title: 'Nifty up', url: 'https://x.test/o', summary: null, publishedAt: now - 20 * 86_400_000 }]) };
    const s = store();
    expect((await new NewsService([old], s, tagger(), assess, env).ingest(new AbortController().signal)).fetched).toBe(0);
  });
});

describe('NewsService tagging and scoring', () => {
  it('tags markets from the source, keeps crowd and vendor sentiment, and scores the unscored', async () => {
    const reddit: NewsSource = { name: 'Reddit', markets: ['us'], fetch: () => Promise.resolve([
      { source: 'r/wallstreetbets', title: 'NVDA to the moon', url: 'https://r.test/1', summary: null, publishedAt: now - 60_000, crowd: true },
      { source: 'AV', title: 'Nifty steady', url: 'https://r.test/2', summary: null, publishedAt: now - 60_000, sentiment: { label: 'bullish', score: 0.4, by: 'vendor' } }]) };
    const s = store([item('x', 'ET', 'Nifty up', 5)]);
    const scorer = { score: vi.fn((items: Array<{ id: string }>) => Promise.resolve(new Map<string, Sentiment>(items.map(i => [i.id, { label: 'bullish', score: 0.5, by: 'llm' }])))) };
    const result = await new NewsService([reddit], s, tagger(), assess, env, scorer).ingest(new AbortController().signal);
    expect(result).toMatchObject({ fetched: 2, scored: 1 });
    const inserted = vi.mocked(s.insert).mock.calls[0]?.[0] ?? [];
    expect(inserted.map(i => [i.crowd, i.markets, i.sentiment?.by ?? null])).toEqual([[true, ['us'], null], [false, ['india'], 'vendor']]);
    expect(s.set.get('x')?.by).toBe('llm');
  });
});

describe('NewsService clusters, leads and trend', () => {
  const rows = [item('a', 'ET', 'RBI keeps repo rate unchanged at 6.5%', 10), item('b', 'Mint', 'RBI keeps repo rate unchanged at 6.5% today', 20), item('c', 'BS', 'RBI holds repo rate at 6.5%', 30), item('d', 'ET', 'Crude slides on supply', 5)];
  it('leads carry the source count of their story', async () => {
    const leads = await new NewsService([], store(rows), tagger(), assess, env).leads({ hours: 24, limit: 50 });
    expect(leads.map(l => [l.title.slice(0, 4), l.sourceCount])).toEqual([['Crud', 1], ['RBI ', 3]]);
  });
  it('asks the store for crowd-free rows by default and passes asOf as the upper bound', async () => {
    const s = store(rows);
    await new NewsService([], s, tagger(), assess, env).clusters({ hours: 24, limit: 50, asOf: now - 3_600_000 });
    expect(s.list).toHaveBeenCalledWith(expect.objectContaining({ crowd: false, until: now - 3_600_000 }));
  });
  it('summarises the trend for a symbol over 24h and 7d', async () => {
    const s = store();
    vi.mocked(s.sentimentRows).mockResolvedValue([{ publishedAt: now - 3_600_000, sentiment: { label: 'bullish', score: 0.6, by: 'llm' } }]);
    const trend = await new NewsService([], s, tagger(), assess, env).sentiment({ symbol: 'NSE:INFY' });
    expect(trend.windows.map(w => [w.hours, w.items, w.score])).toEqual([[24, 1, 0.6], [168, 1, 0.6]]);
  });
});
