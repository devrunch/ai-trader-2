import { z } from 'zod';

export const WATCHLIST_MAX = 100;
const Symbol = z.string().trim().min(1).max(64);

/** The user's watchlist in their order. `custom` is false until the first edit; until then the items are the defaults. */
export const WatchlistSchema = z.strictObject({ items: z.array(z.string()), custom: z.boolean() });
export type Watchlist = z.infer<typeof WatchlistSchema>;

export const WatchlistReplaceSchema = z.strictObject({ items: z.array(Symbol).max(WATCHLIST_MAX) });
export const WatchlistAddSchema = z.strictObject({ symbol: Symbol });
