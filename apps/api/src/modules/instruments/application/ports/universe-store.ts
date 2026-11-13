export interface StoredConstituents { members: Array<{ id: string; name: string }>; listDate: string; fetchedAt: string }

export interface UniverseStore {
  get(indexId: string): Promise<StoredConstituents | null>;
  save(indexId: string, value: StoredConstituents, source: string): Promise<void>;
  /** Of these ids, the ones that are active instruments with a price feed (a provider mapping). */
  pricedAmong(ids: readonly string[]): Promise<Set<string>>;
}

export interface ConstituentsFetcher {
  fetch(index: 'nifty50' | 'nifty100' | 'nifty500', signal: AbortSignal): Promise<Array<{ id: string; name: string }>>;
}

/** The part of the watchlists module Universes needs. */
export interface WatchlistReader { get(userId: string): Promise<{ items: string[] }> }
