import { expect, it } from 'vitest';
import { SearchInstruments } from './search-instruments';
import { index } from './instruments.spec-helper';

// FR-SY-6
it('limit is capped at 50 and defaults to 20', () => {
  const searchIndex = index();
  const search = new SearchInstruments(searchIndex);
  expect(search.execute(' nifty ')).toEqual({ query: 'nifty', results: [] });
  expect(searchIndex.search).toHaveBeenLastCalledWith('nifty', { limit: 20 });
  search.execute('x', { limit: 100 });
  expect(searchIndex.search).toHaveBeenLastCalledWith('x', { limit: 50 });
  search.execute('x', { limit: 0, exchange: 'NSE', type: 'stock' });
  expect(searchIndex.search).toHaveBeenLastCalledWith('x', { limit: 1, exchange: 'NSE', type: 'stock' });
});
