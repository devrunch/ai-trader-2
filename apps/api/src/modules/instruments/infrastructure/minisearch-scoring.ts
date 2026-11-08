import type MiniSearch from 'minisearch';

export const tokenizeInstrumentText = (text: string) => text.toLowerCase().split(/[\s\-:/]+/).filter(Boolean);

export function instrumentQueryScores(index: MiniSearch, q: string, termScores: ReadonlyMap<string, ReadonlyMap<string, number>>): Map<string, number> {
  const terms = tokenizeInstrumentText(q);
  const scores = terms.map(term => termScores.get(term)
    ?? new Map(index.search(term).map(result => [String(result.id), result.score])));
  const smallest = scores.toSorted((a, b) => a.size - b.size)[0];
  const combined = new Map<string, number>();
  if (!smallest) return combined;
  // MiniSearch AND sums term scores and multiplies by distinct matched query terms.
  const quality = new Set(terms).size;
  for (const id of smallest.keys()) {
    let total = 0;
    for (const score of scores) {
      const value = score.get(id);
      if (value === undefined) { total = 0; break; }
      total += value;
    }
    if (total > 0) combined.set(id, total * quality);
  }
  return combined;
}

