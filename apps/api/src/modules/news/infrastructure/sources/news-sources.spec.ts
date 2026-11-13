import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectConformingDescriptors } from '../../../../shared/sources/descriptor-conformance.spec-helper';
import { ALPHAVANTAGE_NEWS_DESCRIPTOR, AlphaVantageNewsSource } from './alphavantage-news.source';
import { FINBERT_DESCRIPTOR, FinbertScorer } from './finbert.source';
import { LLM_SENTIMENT_DESCRIPTOR, LlmSentimentBatch } from './llm-sentiment.source';
import { NEWSDATA_DESCRIPTOR, NewsdataSource } from './newsdata.source';
import { REDDIT_DESCRIPTOR, RedditSource } from './reddit.source';
import { clientReturning } from '../../../../shared/sources/source-test-client.spec-helper';
import { YAHOO_TICKER_DESCRIPTOR, YahooTickerRssSource } from './yahoo-ticker-rss.source';

const fixture = (id: string, file: string): string => readFileSync(join(__dirname, '__fixtures__', id, file), 'utf8');
const signal = (): AbortSignal => new AbortController().signal;
const ALL = [NEWSDATA_DESCRIPTOR, ALPHAVANTAGE_NEWS_DESCRIPTOR, REDDIT_DESCRIPTOR, YAHOO_TICKER_DESCRIPTOR, FINBERT_DESCRIPTOR, LLM_SENTIMENT_DESCRIPTOR];
const KEYS = { NEWSDATA_API_KEY: 'k', ALPHAVANTAGE_API_KEY: 'k', HF_API_TOKEN: 't', FINBERT_MODEL: 'ProsusAI/finbert' };

it('declares conforming descriptors', () => { expectConformingDescriptors(ALL, 'news'); });

describe('newsdata (FR-HM-2)', () => {
  it('parses results, treats the date as UTC and skips rows without a title', async () => {
    const { client, health } = clientReturning(ALL, fixture('newsdata', 'latest.json'), KEYS);
    const items = await new NewsdataSource('k', client).fetch(signal());
    expect(items.map(i => [i.source, i.title, new Date(i.publishedAt).toISOString()])).toEqual([
      ['Reuters', 'Rupee slips as oil climbs', '2026-11-12T08:15:00.000Z'], ['CNBC', 'Gold steadies near record', '2026-11-12T07:00:00.000Z']]);
    expect(health.items).toHaveBeenCalledWith('newsdata', 2);
  });
  it('is off without its key and fails when the response changes shape', async () => {
    await expect(new NewsdataSource('', clientReturning(ALL, '{}').client).fetch(signal())).rejects.toThrow('off (no key)');
    await expect(new NewsdataSource('k', clientReturning(ALL, '{"status":"error","results":{"message":"bad"}}', KEYS).client).fetch(signal())).rejects.toThrow();
  });
  it('calls at most every 15 minutes', async () => {
    let now = 0;
    const { client, fetchFn } = clientReturning(ALL, fixture('newsdata', 'latest.json'), KEYS);
    const source = new NewsdataSource('k', client, () => now);
    now = 1_000_000; await source.fetch(signal());
    now += 60_000; expect(await source.fetch(signal())).toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('alphavantage-news', () => {
  it('parses the feed without carrying the vendor sentiment', async () => {
    const items = await new AlphaVantageNewsSource('k', clientReturning(ALL, fixture('alphavantage-news', 'news.json'), KEYS).client).fetch(signal());
    expect(items.map(i => [i.source, new Date(i.publishedAt).toISOString()])).toEqual([['Benzinga', '2026-11-12T08:15:00.000Z'], ['CNBC', '2026-11-12T07:00:00.000Z']]);
    expect(items.every(i => i.sentiment === undefined)).toBe(true);
  });
  it('reports in-band throttling as an error, never an empty success', async () => {
    await expect(new AlphaVantageNewsSource('k', clientReturning(ALL, fixture('alphavantage-news', 'throttled.json'), KEYS).client).fetch(signal())).rejects.toThrow('25 requests per day');
  });
});

describe('reddit crowd chatter (FR-HM-3)', () => {
  it('keeps unstickied posts above the score floor, labelled crowd, with the subreddit as source', async () => {
    const items = await new RedditSource('IndianStockMarket', 'india', clientReturning(ALL, fixture('reddit', 'hot.json')).client).fetch(signal());
    expect(items).toEqual([{ source: 'r/IndianStockMarket', title: 'Nifty breaks 25k, are we going higher?', url: 'https://www.reddit.com/r/IndianStockMarket/comments/a1/nifty/', summary: 'Discussion thread', publishedAt: 1794816000_000, crowd: true }]);
  });
  it('fails when the listing changes shape', async () => {
    await expect(new RedditSource('forex', 'forex', clientReturning(ALL, '{"error":403}').client).fetch(signal())).rejects.toThrow();
  });
});

describe('yahoo-ticker-rss', () => {
  it('fetches the US tickers people watch and tags each headline with its canonical id', async () => {
    const { client, fetchFn } = clientReturning(ALL, fixture('yahoo-ticker-rss', 'feed.xml'));
    const items = await new YahooTickerRssSource(() => Promise.resolve(['NASDAQ:AAPL', 'NSE:INFY']), client).fetch(signal());
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fetchFn.mock.calls[0]?.[0])).toContain('s=AAPL');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(i => i.symbols?.[0] === 'NASDAQ:AAPL')).toBe(true);
  });
  it('does nothing when nobody watches a US symbol', async () => {
    const { client, fetchFn } = clientReturning(ALL, '');
    expect(await new YahooTickerRssSource(() => Promise.resolve(['NSE:INFY']), client).fetch(signal())).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('finbert', () => {
  it('scores positive minus negative and labels it', async () => {
    const out = await new FinbertScorer('t', 'ProsusAI/finbert', clientReturning(ALL, fixture('finbert', 'response.json'), KEYS).client).score([{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], signal());
    expect([...out.entries()]).toEqual([['a', { label: 'bullish', score: 0.77, by: 'finbert' }], ['b', { label: 'bearish', score: -0.6, by: 'finbert' }]]);
  });
  it('rejects a response with the wrong number of verdicts', async () => {
    await expect(new FinbertScorer('t', 'm', clientReturning(ALL, '[]', KEYS).client).score([{ id: 'a', text: 'x' }], signal())).rejects.toThrow('changed shape');
  });
});

describe('LlmSentimentBatch schema', () => {
  it('accepts one verdict per id and rejects out-of-range scores or unknown labels', () => {
    expect(LlmSentimentBatch.parse({ items: [{ id: 'a', label: 'bullish', score: 0.7 }] }).items).toHaveLength(1);
    expect(() => LlmSentimentBatch.parse({ items: [{ id: 'a', label: 'bullish', score: 1.7 }] })).toThrow();
    expect(() => LlmSentimentBatch.parse({ items: [{ id: 'a', label: 'happy', score: 0.1 }] })).toThrow();
  });
});
