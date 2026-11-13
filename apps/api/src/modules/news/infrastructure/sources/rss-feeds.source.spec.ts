import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RSS_DESCRIPTORS, RSS_FEEDS, RssSource } from './rss.source';
import { clientReturning } from '../../../../shared/sources/source-test-client.spec-helper';

const fixture = (id: string): string => readFileSync(join(__dirname, '__fixtures__', id, 'feed.xml'), 'utf8');
const signal = (): AbortSignal => new AbortController().signal;

describe.each(RSS_FEEDS)('$id (FR-NW-1)', feed => {
  const descriptor = RSS_DESCRIPTORS.find(d => d.id === feed.id);

  it('parses the recorded feed into three headlines with source, url and time', async () => {
    const { client, health, fetchFn } = clientReturning(RSS_DESCRIPTORS, fixture(feed.id));
    const headlines = await new RssSource(feed.name, feed.id, feed.url, client).fetch(signal());
    expect(headlines).toHaveLength(3);
    for (const h of headlines) {
      expect(h.source).toBe(feed.name);
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.url).toMatch(/^https?:\/\//);
      expect(Number.isFinite(h.publishedAt)).toBe(true);
      expect(h.title).not.toMatch(/<[a-z]/i);
    }
    expect(fetchFn.mock.calls[0]?.[0]).toBe(feed.url);
    expect(health.items).toHaveBeenCalledWith(feed.id, 3);
  });

  it('fails, recording the failure, when the feed changes shape', async () => {
    const { client, health } = clientReturning(RSS_DESCRIPTORS, '<html><body>Please enable JavaScript</body></html>');
    await expect(new RssSource(feed.name, feed.id, feed.url, client).fetch(signal())).rejects.toThrow('not an RSS document');
    expect(health.items).not.toHaveBeenCalled();
  });

  it('declares a keyless news descriptor at 5-minute cadence with terms', () => {
    expect(descriptor).toMatchObject({ owner: 'news', kind: 'headlines', envKeys: [], schedule: '*/5 * * * *', docs: feed.url });
    expect(descriptor?.terms.length).toBeGreaterThan(20);
  });
});

it('lists the live feeds by id', () => {
  expect(RSS_DESCRIPTORS.map(d => d.id)).toEqual(['rss-et', 'rss-mint', 'rss-bs', 'rss-cnbctv18', 'rss-businessline', 'rss-investing', 'rss-yahoo-index', 'rss-investing-forex', 'rss-investing-commodities', 'rss-fxstreet', 'rss-oilprice', 'rss-coindesk', 'rss-cointelegraph', 'rss-cnbc-markets', 'rss-marketwatch']);
});
