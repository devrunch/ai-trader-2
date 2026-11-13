import { WATCHLIST_MAX, type Watchlist } from '@aitrader/contracts';
import { ValidationError } from '../../../shared/errors';

export interface WatchlistStore {
  /** null until the user first edits their list. */
  get(userId: string): Promise<string[] | null>;
  save(userId: string, items: string[]): Promise<void>;
  /** Every symbol on any user's list, for feeds that follow what people watch. */
  allSymbols(): Promise<string[]>;
}

export interface WatchlistDeps {
  /** The list a new user sees: the popular instruments. */
  defaults(): string[];
  /** The canonical id of an instrument that exists; throws when it does not. */
  canonical(symbol: string): Promise<string>;
}

/** One ordered list per user; the defaults stand in until the first edit, which starts from them. */
export class Watchlists {
  constructor(private readonly store: WatchlistStore, private readonly deps: WatchlistDeps) {}

  allSymbols(): Promise<string[]> { return this.store.allSymbols(); }

  async get(userId: string): Promise<Watchlist> {
    const saved = await this.store.get(userId);
    return { items: saved ?? this.deps.defaults(), custom: saved !== null };
  }

  /** Reorder or edit in one go. Ids already on the list are kept as they are; new ones must resolve. */
  async replace(userId: string, items: string[]): Promise<Watchlist> {
    const current = new Set((await this.get(userId)).items);
    const resolved = await Promise.all(items.map(s => (current.has(s) ? Promise.resolve(s) : this.deps.canonical(s))));
    return this.save(userId, [...new Set(resolved)]);
  }

  async add(userId: string, symbol: string): Promise<Watchlist> {
    const id = await this.deps.canonical(symbol);
    const { items } = await this.get(userId);
    if (items.includes(id)) return { items, custom: true };
    if (items.length >= WATCHLIST_MAX) throw new ValidationError(`The watchlist holds at most ${String(WATCHLIST_MAX)} symbols`, { field: 'symbol' });
    return this.save(userId, [...items, id]);
  }

  async remove(userId: string, symbol: string): Promise<Watchlist> {
    const { items } = await this.get(userId);
    return this.save(userId, items.filter(s => s !== symbol));
  }

  private async save(userId: string, items: string[]): Promise<Watchlist> {
    await this.store.save(userId, items);
    return { items, custom: true };
  }
}
