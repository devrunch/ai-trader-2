import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { OptionChainSchema, OptionsSummarySchema } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';

const REFRESH_MS = 30_000;

/** The ticker part of `NSE:RELIANCE`, or null when the symbol is not an NSE one (only NSE has F&O here). */
export function underlyingOf(symbol: string): string | null {
  const [exchange, ticker] = symbol.split(':');
  return exchange === 'NSE' && ticker ? ticker : null;
}

function path(underlying: string, kind: 'chain' | 'summary', expiry: string | undefined): string {
  const params = new URLSearchParams();
  if (expiry) params.set('expiry', expiry);
  if (kind === 'chain') params.set('strikes', '10');
  const query = params.toString();
  return `v1/options/${encodeURIComponent(underlying)}/${kind}${query ? `?${query}` : ''}`;
}

export function useOptionChain(underlying: string | null, expiry: string | undefined) {
  return useQuery({ queryKey: ['options', 'chain', underlying, expiry], enabled: underlying !== null, refetchInterval: REFRESH_MS, retry: false,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => apiFetch(path(underlying ?? '', 'chain', expiry), { schema: OptionChainSchema, signal }) });
}

export function useOptionsSummary(underlying: string | null, expiry: string | undefined) {
  return useQuery({ queryKey: ['options', 'summary', underlying, expiry], enabled: underlying !== null && expiry !== undefined, refetchInterval: REFRESH_MS, retry: false,
    queryFn: ({ signal }) => apiFetch(path(underlying ?? '', 'summary', expiry), { schema: OptionsSummarySchema, signal }) });
}
