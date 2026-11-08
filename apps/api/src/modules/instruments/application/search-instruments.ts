import type { InstrumentSearchResponseSchema } from '@aitrader/contracts';
import type { z } from 'zod';
import type { SearchIndex, SearchOptions } from './ports/search-index.js';

export class SearchInstruments {
  constructor(private readonly index: SearchIndex) {}

  execute(q: string, opts: Partial<SearchOptions> = {}): z.infer<typeof InstrumentSearchResponseSchema> {
    const query = q.trim();
    const limit = Math.max(1, Math.min(50, opts.limit ?? 20));
    return { query, results: this.index.search(query, { ...opts, limit }) };
  }
}
