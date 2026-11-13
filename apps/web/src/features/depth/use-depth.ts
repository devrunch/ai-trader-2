import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DepthResponseSchema, type DepthResponse } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';
import { liveClient } from '../../shared/live';

/** A book older than this is shown as stale: the server's own store expires it after 15 s. */
export const STALE_MS = 10_000;

/** The book for a symbol: fetched once, then replaced by the live pushes (about one a second, one render each); polling is the fallback if the socket is down. */
export function useDepth(symbol: string) {
  const queryClient = useQueryClient();
  const key = ['depth', symbol];
  const query = useQuery({ queryKey: key, refetchInterval: 10_000,
    queryFn: ({ signal }) => apiFetch(`v1/depth/${encodeURIComponent(symbol)}`, { schema: DepthResponseSchema, signal }) });
  useEffect(() => liveClient().watchDepth(symbol, (response: DepthResponse) => { queryClient.setQueryData(['depth', symbol], response); }), [symbol, queryClient]);
  return query;
}

/** Wall-clock time refreshed every few seconds so a feed that went quiet turns stale without any push. */
export function useNow(intervalMs = 3000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => { setNow(Date.now()); }, intervalMs); return () => { clearInterval(timer); }; }, [intervalMs]);
  return now;
}
