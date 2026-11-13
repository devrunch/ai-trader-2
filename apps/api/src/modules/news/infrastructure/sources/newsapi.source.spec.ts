import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEWSAPI_DESCRIPTOR, NewsApiSource } from './newsapi.source';
import { clientReturning } from '../../../../shared/sources/source-test-client.spec-helper';

const fixture = readFileSync(join(__dirname, '__fixtures__', 'newsapi', 'everything.json'), 'utf8');
const signal = (): AbortSignal => new AbortController().signal;
const env = { NEWS_API_KEY: 'secret' };

describe('newsapi (FR-NW-1)', () => {
  it('parses the recorded response, dropping removed articles, and sends the key as a header', async () => {
    const { client, health, fetchFn } = clientReturning([NEWSAPI_DESCRIPTOR], fixture, env);
    const headlines = await new NewsApiSource('secret', client).fetch(signal());
    expect(headlines).toEqual([
      { source: 'Reuters', title: 'Fed officials signal patience on rate cuts', url: 'https://www.reuters.com/markets/us/fed-patience-2026-11-11/', summary: 'Policymakers said inflation progress is uneven.', publishedAt: Date.parse('2026-11-11T14:05:00Z') },
      { source: 'CNBC', title: 'Gold slips as dollar firms', url: 'https://www.cnbc.com/2026/11/11/gold-slips.html', summary: null, publishedAt: Date.parse('2026-11-11T12:30:00Z') },
    ]);
    expect(fetchFn.mock.calls[0]?.[0]).toEqual(expect.stringContaining('https://newsapi.org/v2/everything?language=en&sortBy=publishedAt&pageSize=50'));
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-api-key': 'secret' });
    expect(health.items).toHaveBeenCalledWith('newsapi', 2);
  });

  it('calls at most once an hour', async () => {
    let now = 10_000_000;
    const { client, fetchFn } = clientReturning([NEWSAPI_DESCRIPTOR], fixture, env);
    const source = new NewsApiSource('secret', client, () => now);
    await source.fetch(signal());
    now += 59 * 60_000;
    expect(await source.fetch(signal())).toEqual([]);
    now += 2 * 60_000;
    expect(await source.fetch(signal())).toHaveLength(2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('fails when the response changes shape', async () => {
    const { client, health } = clientReturning([NEWSAPI_DESCRIPTOR], '{"status":"error","code":"apiKeyInvalid"}', env);
    await expect(new NewsApiSource('secret', client).fetch(signal())).rejects.toThrow();
    expect(health.items).not.toHaveBeenCalled();
  });

  it('is off without NEWS_API_KEY and limited to 100 requests a day', async () => {
    const { client, fetchFn } = clientReturning([NEWSAPI_DESCRIPTOR], fixture, {});
    await expect(new NewsApiSource('', client).fetch(signal())).rejects.toThrow('off (no key)');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(NEWSAPI_DESCRIPTOR).toMatchObject({ envKeys: ['NEWS_API_KEY'], rateLimit: { requests: 100, windowSec: 86_400 } });
  });
});
