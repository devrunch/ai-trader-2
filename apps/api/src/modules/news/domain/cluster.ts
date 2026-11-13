import type { NewsCluster, NewsItemFull, Sentiment } from '@aitrader/contracts';
import { labelOf } from './sentiment';

const WINDOW_MS = 12 * 3_600_000;
const SIMILARITY = 0.5;
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'as', 'for', 'by', 'with', 'from', 'is', 'are', 'its', 'it', 'after', 'amid', 'says', 'said', 'that', 'this', 'be']);
const RANK = { high: 3, medium: 2, low: 1 } as const;

const tokens = (title: string): Set<string> => new Set((title.toLowerCase().match(/[a-z0-9]+(?:\.[0-9]+)?/g) ?? []).filter(t => !STOP.has(t) && (t.length > 1 || /\d/.test(t))));

/** Jaccard overlap of the words of two headlines, 0..1. */
export function titleSimilarity(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / (x.size + y.size - shared);
}

const unique = <T>(values: T[]): T[] => [...new Set(values)];
const round2 = (n: number): number => Math.round(n * 100) / 100;

function averageSentiment(members: NewsItemFull[]): Sentiment | null {
  const scored = members.flatMap(m => (m.sentiment ? [m.sentiment] : []));
  const first = scored[0];
  if (!first) return null;
  const score = round2(scored.reduce((sum, s) => sum + s.score, 0) / scored.length);
  return { label: labelOf(score), score, by: first.by };
}

/** The same story from several sources becomes one cluster: titles that share most of their words and appear within 12 hours of each other. Newest cluster first. */
export function clusterNews(items: NewsItemFull[]): NewsCluster[] {
  const groups: NewsItemFull[][] = [];
  for (const item of [...items].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt))) {
    const t = Date.parse(item.publishedAt);
    const home = groups.find(g => g.some(m => Math.abs(Date.parse(m.publishedAt) - t) <= WINDOW_MS && titleSimilarity(m.title, item.title) >= SIMILARITY));
    if (home) home.push(item); else groups.push([item]);
  }
  return groups.map((members): NewsCluster => {
    const lead = members.reduce((best, m) => (RANK[m.impact] > RANK[best.impact] ? m : best));
    const first = members[0] ?? lead;
    const last = members[members.length - 1] ?? lead;
    const sources = unique(members.map(m => m.source));
    return { id: first.id, lead, sourceCount: sources.length, sources, items: members.map(m => m.id), symbols: unique(members.flatMap(m => m.symbols)),
      markets: unique(members.flatMap(m => m.markets ?? [])), sentiment: averageSentiment(members), firstSeen: first.publishedAt, lastSeen: last.publishedAt };
  }).sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen));
}
