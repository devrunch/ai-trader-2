import { describe, expect, it } from 'vitest';
import type { NewsItemFull } from '@aitrader/contracts';
import { clusterNews, titleSimilarity } from './cluster';

const at = (min: number) => new Date(Date.UTC(2026, 10, 12, 4, min)).toISOString();
const item = (id: string, source: string, title: string, min: number, symbols: string[] = []): NewsItemFull => ({
  id, source, title, url: `https://x.test/${id}`, summary: null, publishedAt: at(min), symbols, impact: 'medium', moves: [], direction: null, markets: ['india'] });

describe('titleSimilarity', () => {
  it('is 1 for the same words in another order and low for different stories', () => {
    expect(titleSimilarity('RBI keeps repo rate unchanged at 6.5%', 'Repo rate unchanged at 6.5%: RBI keeps')).toBe(1);
    expect(titleSimilarity('RBI keeps repo rate unchanged', 'Infosys wins large cloud deal')).toBeLessThan(0.2);
  });
});

describe('clusterNews', () => {
  const rbi = [
    item('a', 'Economic Times', 'RBI keeps repo rate unchanged at 6.5%, rupee gains', 0, ['FX:USDINR']),
    item('b', 'Livemint', 'RBI keeps repo rate unchanged at 6.5% as rupee gains', 20),
    item('c', 'Business Standard', 'RBI holds repo rate at 6.5%; rupee gains', 45, ['FX:USDINR']),
  ];
  it('groups the same story from several sources into one cluster with its source count (FR-HM-2)', () => {
    const clusters = clusterNews([...rbi, item('d', 'CNBC-TV18', 'Infosys wins $1 billion cloud deal', 10, ['NSE:INFY'])]);
    expect(clusters).toHaveLength(2);
    const story = clusters.find(c => c.items.includes('a'));
    expect(story?.sourceCount).toBe(3);
    expect(story?.items.sort()).toEqual(['a', 'b', 'c']);
    expect(story?.symbols).toEqual(['FX:USDINR']);
    expect(story?.lead.id).toBe('a');
  });
  it('keeps the same title apart when it is outside the time window', () => {
    const clusters = clusterNews([item('a', 'ET', 'Gold hits record high', 0), item('b', 'Mint', 'Gold hits record high', 60 * 30)]);
    expect(clusters).toHaveLength(2);
  });
  it('counts one source once', () => {
    const [cluster] = clusterNews([item('a', 'ET', 'Nifty ends higher on banks', 0), item('b', 'ET', 'Nifty ends higher on banks lift', 5)]);
    expect(cluster?.sourceCount).toBe(1);
    expect(cluster?.items).toHaveLength(2);
  });
  it('averages the sentiment of scored members and orders clusters newest first', () => {
    const scored = (i: NewsItemFull, score: number): NewsItemFull => ({ ...i, sentiment: { label: score > 0 ? 'bullish' : 'bearish', score, by: 'rules' } });
    const clusters = clusterNews([scored(rbi[0] as NewsItemFull, 0.6), scored(rbi[1] as NewsItemFull, 0.2), item('z', 'ET', 'Crude slides on supply', 300)]);
    expect(clusters[0]?.lead.id).toBe('z');
    expect(clusters[1]?.sentiment).toEqual({ label: 'bullish', score: 0.4, by: 'rules' });
  });
});
