import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WatchlistSchema, type Watchlist } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';

const KEY = ['watchlist'];
type Context = { before: Watchlist | undefined };

/** The user's saved watchlist; the popular defaults until their first edit. */
export function useWatchlist() {
  return useQuery({ queryKey: KEY, staleTime: 60_000, queryFn: ({ signal }) => apiFetch('v1/watchlist', { schema: WatchlistSchema, signal }) });
}

/** Remove and reorder show at once and roll back if the server refuses; add waits for the server to resolve the symbol. */
export function useWatchlistEdit() {
  const client = useQueryClient();
  function edit<V>(request: (v: V) => Promise<Watchlist>, next?: (items: string[], v: V) => string[]) {
    return {
      retry: 0, mutationFn: request,
      onMutate: async (v: V): Promise<Context> => {
        await client.cancelQueries({ queryKey: KEY });
        const before = client.getQueryData<Watchlist>(KEY);
        if (before && next) client.setQueryData<Watchlist>(KEY, { items: next(before.items, v), custom: true });
        return { before };
      },
      onError: (_e: unknown, _v: V, context: Context | undefined) => { if (context?.before) client.setQueryData(KEY, context.before); },
      onSuccess: (data: Watchlist) => { client.setQueryData(KEY, data); },
    };
  }
  const add = useMutation(edit((symbol: string) => apiFetch('v1/watchlist/items', { method: 'POST', body: { symbol }, schema: WatchlistSchema })));
  const remove = useMutation(edit((symbol: string) => apiFetch(`v1/watchlist/items/${encodeURIComponent(symbol)}`, { method: 'DELETE', schema: WatchlistSchema }),
    (items, symbol) => items.filter(s => s !== symbol)));
  const reorder = useMutation(edit((items: string[]) => apiFetch('v1/watchlist', { method: 'PUT', body: { items }, schema: WatchlistSchema }),
    (_items, order) => order));
  return { add, remove, reorder };
}
