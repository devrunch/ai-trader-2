import { UNIVERSES, type UniverseId, type UniverseInfo } from '@aitrader/contracts';
import { COMMODITIES, CRYPTO_MAJORS, FOREX_CROSSES, FOREX_MAJORS, US_LARGE } from '../domain/curated-universes.js';
import type { ConstituentsFetcher, StoredConstituents, UniverseStore, WatchlistReader } from './ports/universe-store.js';

type NseIndex = Parameters<ConstituentsFetcher['fetch']>[0];
export interface UniverseMember { symbol: string; name: string | null }
interface Resolved { members: UniverseMember[]; note: string | null }

const NAMES: Record<UniverseId, string> = {
  nifty50: 'NIFTY 50', nifty100: 'NIFTY 100', nifty500: 'NIFTY 500', 'forex-majors': 'Forex majors', 'forex-crosses': 'Forex crosses',
  commodities: 'Commodities', 'us-large': 'US large caps', 'crypto-majors': 'Crypto majors', watchlist: 'My watchlist',
};
const CURATED: Partial<Record<UniverseId, readonly string[]>> = {
  'forex-majors': FOREX_MAJORS, 'forex-crosses': FOREX_CROSSES, commodities: COMMODITIES, 'us-large': US_LARGE, 'crypto-majors': CRYPTO_MAJORS,
};
const NSE_INDICES: readonly UniverseId[] = ['nifty50', 'nifty100', 'nifty500'];
/** Constituent lists change a few times a year; refetch when the stored list is older than this (the weekly job normally keeps it fresh). */
const MAX_AGE_MS = 8 * 86_400_000;

export interface UniverseDeps {
  store: UniverseStore; fetcher: ConstituentsFetcher; watchlists: WatchlistReader;
  /** Used only when nothing was ever stored and the fetch fails. */
  fallback: { index: NseIndex; date: string; ids: readonly string[] };
  clock?: () => Date; warn?: (message: string, detail: Record<string, unknown>) => void;
}

/** The sets of instruments a scan can run on. A universe lists only instruments that exist in the master and have a price feed; drops are counted in `note`. */
export class Universes {
  private readonly clock: () => Date;
  private readonly inflight = new Map<NseIndex, Promise<StoredConstituents | null>>();
  constructor(private readonly deps: UniverseDeps) { this.clock = deps.clock ?? (() => new Date()); }

  async list(): Promise<UniverseInfo[]> {
    const out: UniverseInfo[] = [];
    for (const id of UNIVERSES) {
      if (id === 'watchlist') { out.push({ id, name: NAMES[id], count: 0, note: 'your own list; the count depends on the user' }); continue; }
      const { members, note } = await this.resolve(id);
      out.push({ id, name: NAMES[id], count: members.length, note });
    }
    return out;
  }

  async members(id: UniverseId, userId: string): Promise<UniverseMember[]> {
    return (await this.resolve(id, userId)).members;
  }

  /** Fetches and stores every NSE index list; one failing index does not stop the others. Throws when none could be refreshed. */
  async refresh(signal: AbortSignal): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    let failure: unknown;
    for (const id of NSE_INDICES) {
      try { counts[id] = (await this.fetchAndStore(id as NseIndex, signal))?.members.length ?? 0; } catch (error) { failure = error; this.deps.warn?.('universe refresh failed', { id, error: String(error) }); }
    }
    if (Object.keys(counts).length === 0) throw failure instanceof Error ? failure : new Error('universe refresh failed');
    return counts;
  }

  private async resolve(id: UniverseId, userId?: string): Promise<Resolved> {
    if (id === 'watchlist') {
      if (userId === undefined) return { members: [], note: null };
      return this.priced((await this.deps.watchlists.get(userId)).items.map(symbol => ({ symbol, name: null })), null);
    }
    const curated = CURATED[id];
    if (curated) return this.priced(curated.map(symbol => ({ symbol, name: null })), null);
    const { listed, note } = await this.nseList(id as NseIndex);
    return this.priced(listed.map(m => ({ symbol: m.id, name: m.name })), note);
  }

  private async priced(listed: UniverseMember[], note: string | null): Promise<Resolved> {
    const ok = await this.deps.store.pricedAmong(listed.map(m => m.symbol));
    const members = listed.filter(m => ok.has(m.symbol));
    const dropped = listed.length - members.length;
    const parts = [note, dropped > 0 ? `${String(dropped)} of ${String(listed.length)} dropped: not in the instrument master or no price feed` : null].filter((p): p is string => p !== null);
    return { members, note: parts.length ? parts.join('; ') : null };
  }

  private async nseList(index: NseIndex): Promise<{ listed: Array<{ id: string; name: string | null }>; note: string | null }> {
    let stored = await this.deps.store.get(index);
    if (!stored || this.clock().getTime() - Date.parse(stored.fetchedAt) > MAX_AGE_MS) {
      const fresh = await this.fetchAndStore(index).catch((error: unknown) => { this.deps.warn?.('constituent fetch failed', { index, error: String(error) }); return null; });
      stored = fresh ?? stored;
    }
    if (stored) return { listed: stored.members, note: this.age(stored) };
    if (index === this.deps.fallback.index) {
      return { listed: this.deps.fallback.ids.map(id => ({ id, name: null })), note: `built-in list of ${this.deps.fallback.date}; the live list could not be fetched` };
    }
    return { listed: [], note: 'constituent list not fetched yet' };
  }

  private age(stored: StoredConstituents): string | null {
    return this.clock().getTime() - Date.parse(stored.fetchedAt) > MAX_AGE_MS ? `list of ${stored.listDate}; refresh failed` : null;
  }

  private fetchAndStore(index: NseIndex, signal: AbortSignal = AbortSignal.timeout(60_000)): Promise<StoredConstituents | null> {
    const running = this.inflight.get(index);
    if (running) return running;
    const task = (async (): Promise<StoredConstituents> => {
      const members = await this.deps.fetcher.fetch(index, signal);
      const now = this.clock();
      const value = { members, listDate: now.toISOString().slice(0, 10), fetchedAt: now.toISOString() };
      await this.deps.store.save(index, value, 'nse-indices');
      return value;
    })().finally(() => { this.inflight.delete(index); });
    this.inflight.set(index, task);
    return task;
  }
}
