import MiniSearch from 'minisearch';
import type { InstrumentSummary } from '@aitrader/contracts';
import { InstrumentId, type Instrument } from '../domain/index.js';
import type { SearchIndex, SearchOptions } from '../application/ports/search-index.js';
import { instrumentQueryScores, tokenizeInstrumentText } from './minisearch-scoring.js';
import { POPULAR_INSTRUMENTS } from './popular-instruments.js';

const popular = POPULAR_INSTRUMENTS;
const popularity = new Map(popular.map((id, position) => [id, position]));
const types = ['index', 'stock', 'etf', 'continuous', 'futures', 'commodity', 'forex', 'metal', 'option', 'bond'];
function createIndex() {
  return new MiniSearch({ fields: ['ticker', 'aliases', 'description'], tokenize: tokenizeInstrumentText,
    searchOptions: { boost: { ticker: 4, aliases: 3, description: 1 }, prefix: true,
      fuzzy: term => term.length >= 4 ? 0.2 : false, combineWith: 'AND' } });
}
function summary(i: Instrument): InstrumentSummary {
  return { id: String(i.id), description: i.description, exchange: i.exchange, type: i.type, currency: i.currency, status: i.status };
}
function active(i: Instrument): number { return i.status === 'active' || i.status === 'suspended' ? 0 : 1; }
function rank(i: Instrument): number { return types.indexOf(i.ticker.endsWith('!') ? 'continuous' : i.type); }
function exact(i: Instrument, q: string): number {
  return i.ticker.toLowerCase() === q || i.aliases.some(a => a.toLowerCase() === q) ? 0 : 1;
}
function compareId(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

interface RankedCandidate {
  i: Instrument; id: string; score: number; priority: number; popular: number; exact: number;
  prefix: number; active: number; exchange: number; rank: number;
}
const exchanges = ['NSE', 'BSE', 'NASDAQ', 'NYSE', 'NYSEARCA', 'AMEX', 'CBOE', 'IEX', 'MCX', 'OANDA', 'FX'];
function exchangeRank(i: Instrument): number {
  if (i.exchange === 'MCX' && (i.type === 'commodity' || i.type === 'metal')) return -1;
  const position = exchanges.indexOf(i.exchange);
  return position < 0 ? exchanges.length : position;
}

function preferExchanges(candidates: RankedCandidate[]): void {
  const families = new Map<string, { position: number; candidate: RankedCandidate }[]>();
  candidates.forEach((candidate, position) => {
    const { i, priority, popular, exact, prefix, active } = candidate;
    const key = JSON.stringify([i.ticker, priority, popular, exact, prefix, active]);
    const family = families.get(key) ?? [];
    family.push({ position, candidate });
    families.set(key, family);
  });
  // Reorder each ticker's occupied slots, preserving unrelated tickers' relevance and all higher tiers.
  for (const family of families.values()) {
    if (family.length < 2) continue;
    const ordered = family.map(entry => entry.candidate).sort((a, b) => a.exchange - b.exchange
      || a.rank - b.rank || b.score - a.score || compareId(a.id, b.id));
    family.forEach((entry, n) => {
      const candidate = ordered[n];
      if (candidate) candidates[entry.position] = candidate;
    });
  }
}

function createSnapshot() {
  const defaults: string[] = [];
  return { index: createIndex(), instruments: new Map<string, Instrument>(), isins: new Map<string, string>(),
    defaults, termScores: new Map<string, Map<string, number>>(), shortQueries: new Map<string, string[]>(), queries: new Map<string, string[]>(), cachedIds: 0 };
}

function countPrefixes(tokens: string[], counts: Map<string, number>): void {
  const prefixes = new Set<string>();
  for (const token of tokens) {
    for (let length = 1; length <= Math.min(token.length, 12); length++) prefixes.add(token.slice(0, length));
  }
  for (const prefix of prefixes) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
}

function rankedIds(snapshot: ReturnType<typeof createSnapshot>, raw: string, q: string): string[] {
  const { instruments } = snapshot;
  const canonical = InstrumentId.tryParse(raw)?.toString();
  const scores = instrumentQueryScores(snapshot.index, q, snapshot.termScores);
  if (canonical && instruments.has(canonical)) scores.set(canonical, Infinity);
  const candidates: RankedCandidate[] = [];
  for (const [id, score] of scores) {
    const i = instruments.get(id);
    if (i) candidates.push({ i, id, score, priority: id === canonical ? 0 : 1,
      popular: popularity.get(id) ?? popular.length, exact: exact(i, q),
      prefix: i.ticker.toLowerCase().startsWith(q) ? i.ticker.length : Infinity,
      active: active(i), exchange: exchangeRank(i), rank: rank(i) });
  }
  candidates.sort((a, b) => a.priority - b.priority || Number(a.popular === popular.length) - Number(b.popular === popular.length)
    || a.exact - b.exact || Number(a.prefix === Infinity) - Number(b.prefix === Infinity)
    || a.popular - b.popular || a.prefix - b.prefix
    || a.active - b.active || a.rank - b.rank
    || b.score - a.score || a.i.ticker.length - b.i.ticker.length || compareId(a.id, b.id));
  preferExchanges(candidates);
  return candidates.map(({ id }) => id);
}

function cachedQuery(snapshot: ReturnType<typeof createSnapshot>, raw: string, q: string): string[] {
  const key = raw.trim();
  const cached = snapshot.queries.get(key);
  if (cached) {
    snapshot.queries.delete(key);
    snapshot.queries.set(key, cached);
    return cached;
  }
  const ids = rankedIds(snapshot, raw, q);
  // Bound both retained query count and total ID references, independent of caller limits and filters.
  while (snapshot.queries.size >= 64 || snapshot.cachedIds + ids.length > 100000) {
    const oldest = snapshot.queries.keys().next().value;
    if (oldest === undefined) break;
    snapshot.cachedIds -= snapshot.queries.get(oldest)?.length ?? 0;
    snapshot.queries.delete(oldest);
  }
  if (ids.length <= 100000) {
    snapshot.queries.set(key, ids);
    snapshot.cachedIds += ids.length;
  }
  return ids;
}

export class MiniSearchIndex implements SearchIndex {
  private snapshot = createSnapshot();

  rebuild(instruments: readonly Instrument[]): void {
    const next = createSnapshot();
    const prefixes = new Set<string>();
    const prefixCounts = new Map<string, number>();
    for (const i of instruments) {
      const id = String(i.id);
      next.instruments.set(id, i);
      if (i.isin) next.isins.set(i.isin.toLowerCase(), id);
      const document = { id, ticker: i.ticker, aliases: i.aliases.join(' '), description: i.description };
      next.index.add(document);
      const tokens = tokenizeInstrumentText(`${document.ticker} ${document.aliases} ${document.description}`);
      countPrefixes(tokens, prefixCounts);
      for (const token of tokens) {
        const prefix = token[0];
        if (prefix) prefixes.add(prefix);
      }
    }
    // Common term postings belong to the rebuilt index, not the result cache.
    const common = [...prefixCounts].filter(([, count]) => count >= Math.max(10, instruments.length / 10))
      .sort((a, b) => b[1] - a[1] || compareId(a[0], b[0])).slice(0, 64);
    for (const [term] of common) next.termScores.set(term,
      new Map(next.index.search(term).map(result => [String(result.id), result.score])));
    next.defaults = [...popular, ...[...next.instruments.keys()].filter(id => !popular.includes(id)).sort(compareId)];
    // Broad one-character prefixes are scored once per master, with the same ranking as longer queries.
    for (const prefix of prefixes) next.shortQueries.set(prefix, rankedIds(next, prefix, prefix));
    // Publish only complete snapshots; failed rebuilds leave the current master usable.
    this.snapshot = next;
  }

  search(raw: string, opts: SearchOptions): InstrumentSummary[] {
    const snapshot = this.snapshot;
    const q = raw.trim().toLowerCase();
    const isin = snapshot.isins.get(q);
    const ids = isin ? [isin] : !q ? snapshot.defaults : snapshot.shortQueries.get(q) ?? cachedQuery(snapshot, raw, q);
    const result: InstrumentSummary[] = [];
    for (const id of ids) {
      const i = snapshot.instruments.get(id);
      if (i && (!opts.exchange || i.exchange === opts.exchange) && (!opts.type || i.type === opts.type)) result.push(summary(i));
      if (result.length >= opts.limit) break;
    }
    return result;
  }

  suggest(q: string, limit: number): InstrumentId[] {
    return this.search(q, { limit }).map(i => InstrumentId.parse(i.id));
  }
}
