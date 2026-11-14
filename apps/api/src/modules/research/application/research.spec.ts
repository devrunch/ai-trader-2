import { describe, expect, it, vi } from 'vitest';
import { ResearchService, type WebResult } from './research';

const signal = new AbortController().signal;
const hit = (n: number): WebResult => ({ title: `t${String(n)}`, url: `https://x.test/${String(n)}`, snippet: 's' });
const budget = (left: number) => ({ take: () => Promise.resolve(left-- > 0 ? 1 : 0) });

describe('ResearchService', () => {
  it('returns at most five cited results', async () => {
    const source = { search: vi.fn().mockResolvedValue(Array.from({ length: 8 }, (_, i) => hit(i))) };
    const out = await new ResearchService(source, budget(5)).search('rbi', signal);
    expect(out).toMatchObject({ available: true, source: 'tavily web search' });
    expect(out.available && out.results).toHaveLength(5);
    expect(source.search).toHaveBeenCalledWith('rbi', 5, signal);
  });
  it('stops at the daily cap (AGENT_WEB_SEARCH_DAILY) without calling the source', async () => {
    const source = { search: vi.fn().mockResolvedValue([hit(1)]) };
    const service = new ResearchService(source, budget(1));
    await service.search('a', signal);
    expect(await service.search('b', signal)).toMatchObject({ available: false, reason: 'the daily web search cap is spent; use getNews and the other data tools' });
    expect(source.search).toHaveBeenCalledTimes(1);
  });
  it('says it is off when there is no key', async () => {
    expect(await new ResearchService(null, budget(5)).search('a', signal)).toMatchObject({ available: false, reason: 'web search is off (no TAVILY_API_KEY)' });
  });
});
