import { describe, expect, it, vi } from 'vitest';
import type { NewsItem } from '@aitrader/contracts';
import { tagger } from '../domain/tagging';
import { NewsService, type NewsSource, type NewsStore } from './news';

const now = Date.parse('2026-11-11T04:00:00Z');
const source = (name: string, items: Array<Partial<{ title: string; url: string; summary: string | null; publishedAt: number }>>): NewsSource => ({
  name, fetch: () => Promise.resolve(items.map(i => ({ source: name, title: 'Nifty rises', url: 'https://x.test/a', summary: null, publishedAt: now - 60_000, ...i }))),
});

const assess = (text: string) => (/rate cut/i.test(text) ? { impact: 'high' as const, moves: ['NSE:NIFTY'], direction: 'up' as const } : { impact: 'low' as const, moves: [], direction: null });

function setup(sources: NewsSource[]) {
  const stored: NewsItem[] = [];
  const store: NewsStore = { insert: vi.fn((items: NewsItem[]) => { stored.push(...items); return Promise.resolve(items.length); }), list: vi.fn(), prune: vi.fn() };
  const warn = vi.fn();
  return { stored, warn, service: new NewsService(sources, store, tagger(), assess, { now: () => now, id: url => `id:${url}`, warn }) };
}

describe('NewsService', () => {
  it('tags, de-duplicates across feeds, and keeps going when one feed fails', async () => {
    const broken: NewsSource = { name: 'broken', fetch: () => Promise.reject(new Error('503')) };
    const { service, stored, warn } = setup([
      source('et', [{ title: 'Reliance shares jump', url: 'https://et.test/1' }, { title: 'Gold slips', url: 'https://et.test/2' }]),
      source('mint', [{ title: 'Reliance shares jump', url: 'https://et.test/1' }]),
      broken,
    ]);
    expect(await service.ingest(new AbortController().signal)).toEqual({ fetched: 2, stored: 2, failed: ['broken'] });
    expect(stored.map(s => [s.title, s.symbols])).toEqual([['Reliance shares jump', ['NSE:RELIANCE']], ['Gold slips', ['MCX:GOLD1!']]]);
    expect(warn).toHaveBeenCalledWith('News feed failed', { source: 'broken' });
  });

  it('stores the impact assessment with each headline', async () => {
    const { service, stored } = setup([source('et', [{ title: 'RBI rate cut surprises', url: 'https://x.test/r' }, { title: 'Gold slips', url: 'https://x.test/g' }])]);
    await service.ingest(new AbortController().signal);
    expect(stored.map(s => [s.impact, s.moves, s.direction])).toEqual([['high', ['NSE:NIFTY'], 'up'], ['low', [], null]]);
  });

  it('passes the impact floor to the store', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const service = new NewsService([], { insert: vi.fn(), list, prune: vi.fn() }, tagger(), assess, { now: () => now, id: u => u, warn: vi.fn() });
    await service.list({ minImpact: 'medium', hours: 1, limit: 5 });
    expect(list).toHaveBeenCalledWith({ symbol: undefined, minImpact: 'medium', since: now - 3_600_000, limit: 5 });
  });

  it('drops stale, future-dated and malformed items', async () => {
    const { service, stored } = setup([source('et', [
      { url: 'https://x.test/old', publishedAt: now - 15 * 86_400_000 },
      { url: 'https://x.test/future', publishedAt: now + 2 * 3_600_000 },
      { url: 'javascript:alert(1)' },
      { url: 'https://x.test/empty', title: '   ' },
      { url: 'https://x.test/ok' },
    ])]);
    await service.ingest(new AbortController().signal);
    expect(stored.map(s => s.url)).toEqual(['https://x.test/ok']);
  });
});
