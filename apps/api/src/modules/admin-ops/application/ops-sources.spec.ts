import { DataSourcesResponseSchema } from '@aitrader/contracts';
import { describe, expect, it } from 'vitest';
import type { SourceDescriptor, SourceHealthRecord } from '../../../shared/sources';
import { OpsSources } from './ops-sources';

const d = (id: string, owner: string, envKeys: string[] = []): SourceDescriptor => ({ id, owner, kind: 'headlines', markets: ['india'], envKeys,
  rateLimit: { requests: 3, windowSec: 300 }, schedule: '*/5 * * * *', terms: 'public feed', docs: 'https://example.test' });
const record: SourceHealthRecord = { lastSuccessAt: '2026-11-12T10:00:00.000Z', lastError: 'HTTP 503', lastErrorAt: '2026-11-12T09:00:00.000Z', lastLatencyMs: 140, items24h: 288, rateLimitHits24h: 2 };

describe('OpsSources', () => {
  it('joins registry and health, sorted by owner then id, and matches the contract', async () => {
    const result = await new OpsSources({
      registry: { list: () => [
        { descriptor: d('rss-b', 'news'), state: 'enabled', missingKeys: [] },
        { descriptor: d('newsapi', 'news', ['NEWS_API_KEY']), state: 'off', missingKeys: ['NEWS_API_KEY'] },
        { descriptor: d('ff-weekly', 'calendar'), state: 'enabled', missingKeys: [] }] },
      health: { read: ids => Promise.resolve(Object.fromEntries(ids.filter(id => id === 'rss-b').map(id => [id, record]))) },
    }).list();
    expect(DataSourcesResponseSchema.parse(result).sources.map(s => s.id)).toEqual(['ff-weekly', 'newsapi', 'rss-b']);
    expect(result.sources[1]).toMatchObject({ state: 'off', missingKeys: ['NEWS_API_KEY'], lastSuccessAt: null, items24h: 0 });
    expect(result.sources[2]).toMatchObject({ lastError: 'HTTP 503', items24h: 288, rateLimitHits24h: 2, lastLatencyMs: 140 });
  });
});
