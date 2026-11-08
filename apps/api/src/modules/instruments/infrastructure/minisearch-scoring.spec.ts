import MiniSearch from 'minisearch';
import { expect, it } from 'vitest';
import { instrumentQueryScores, tokenizeInstrumentText } from './minisearch-scoring';

// FR-SY-6: optimization must retain MiniSearch's exact AND scores, not approximate relevance.
it('preserves MiniSearch scores for cached and uncached terms including repeated terms', () => {
  const index = new MiniSearch({ fields: ['text'], tokenize: tokenizeInstrumentText,
    searchOptions: { prefix: true, fuzzy: term => term.length >= 4 ? 0.2 : false, combineWith: 'AND' } });
  index.addAll([{ id: 'one', text: 'gold spot' }, { id: 'two', text: 'golden spot contract' },
    { id: 'three', text: 'silver spot' }, { id: 'four', text: 'gold future' }]);
  const cached = new Map([['gold', new Map(index.search('gold').map(r => [String(r.id), r.score]))]]);
  for (const query of ['gold', 'gold spot', 'gold gold', 'golld spot', 'silver unknown', '', 'GOLD-SPOT']) {
    const expected = new Map(index.search(query).map(r => [String(r.id), r.score]));
    expect(instrumentQueryScores(index, query, new Map())).toEqual(expected);
    expect(instrumentQueryScores(index, query, cached)).toEqual(expected);
  }
});
