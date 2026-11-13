import { describe, expect, it } from 'vitest';
import { parseRss } from './rss.source';

const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Markets</title>
<item><title><![CDATA[Nifty closes at <b>record</b> high]]></title><link>https://et.test/1</link><pubDate>Tue, 11 Nov 2026 10:00:00 +0530</pubDate>
<description><![CDATA[<p>Benchmarks rose &amp; banks led.</p>]]></description></item>
<item><title>No date</title><link>https://et.test/2</link></item>
</channel></rss>`;

describe('parseRss', () => {
  it('reads items as plain text with absolute times, skipping incomplete ones', () => {
    expect(parseRss('ET', xml)).toEqual([{ source: 'ET', title: 'Nifty closes at record high', url: 'https://et.test/1',
      summary: 'Benchmarks rose & banks led.', publishedAt: Date.parse('2026-11-11T04:30:00Z') }]);
  });
  it('a single item and an empty feed both work', () => {
    expect(parseRss('ET', '<rss><channel><item><title>A</title><link>https://a.test</link><pubDate>Tue, 11 Nov 2026 04:00:00 GMT</pubDate></item></channel></rss>')).toHaveLength(1);
    expect(parseRss('ET', '<rss><channel></channel></rss>')).toEqual([]);
  });
});

describe('feed dates', () => {
  it('reads the bare UTC format some feeds use', () => {
    const xml = '<rss><channel><item><title>A</title><link>https://a.test</link><pubDate>2026-11-11 03:52:40</pubDate></item></channel></rss>';
    expect(parseRss('Investing', xml)[0]?.publishedAt).toBe(Date.parse('2026-11-11T03:52:40Z'));
  });
});

describe('parseRss shape changes', () => {
  it('throws when the document is not RSS', () => {
    expect(() => parseRss('ET', '<html><body>Access denied</body></html>')).toThrow('not an RSS document');
  });
  it('throws when items exist but none can be read', () => {
    expect(() => parseRss('ET', '<rss><channel><item><headline>x</headline></item></channel></rss>')).toThrow('none readable');
  });
});
