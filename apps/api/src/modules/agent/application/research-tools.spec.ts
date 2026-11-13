import { describe, expect, it, vi } from 'vitest';
import { buildResearchTools } from './research-tools';

const deps = { limiter: { take: () => Promise.resolve(true) }, audit: vi.fn() };
const ctx = { userId: 'u1', conversationId: 'c1', turnId: 't1' };

describe('webSearch tool', () => {
  it('passes the query to the research service and returns its cited results', async () => {
    const search = vi.fn().mockResolvedValue({ available: true, results: [{ title: 'a', url: 'https://x.test', snippet: 's' }], source: 'tavily web search' });
    const tool = buildResearchTools({ search }, deps)[0];
    expect(await tool?.call(ctx, { query: 'RBI policy statement' })).toMatchObject({ ok: true, data: { available: true, source: 'tavily web search' } });
    expect(search).toHaveBeenCalledWith('RBI policy statement');
  });
  it('rejects a too-short query and unknown fields', async () => {
    const tool = buildResearchTools({ search: vi.fn() }, deps)[0];
    expect(await tool?.call(ctx, { query: 'a' })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
    expect(await tool?.call(ctx, { query: 'valid query', n: 50 })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });
});
