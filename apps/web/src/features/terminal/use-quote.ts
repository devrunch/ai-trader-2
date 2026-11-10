import { useQuery } from '@tanstack/react-query';
import { QuoteResponseSchema, QuotesResponseSchema, type QuoteResponse } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';
import { prices, useLiveValue } from '../../shared/live';

function useQuote(symbol: string) {
  return useQuery({ queryKey: ['quote', symbol], refetchInterval: 60_000,
    queryFn: ({ signal }) => apiFetch(`v1/quote/${encodeURIComponent(symbol)}`, { schema: QuoteResponseSchema, signal }) });
}

/** Last price (live when streaming, else the quote) and change against the previous close. */
export function useLivePrice(symbol: string) {
  const quote = useQuote(symbol);
  return { quote, ...useLiveChange(symbol, quote.data) };
}

/** Live price against a quote someone else fetched (the watchlist batch). */
export function useLiveChange(symbol: string, data: QuoteResponse | undefined) {
  const live = useLiveValue(prices, `price:${symbol}`);
  const last = live ?? data?.price;
  const previousClose = data && data.change !== null ? data.price - data.change : undefined;
  const change = last !== undefined && previousClose !== undefined ? last - previousClose : undefined;
  const pct = change !== undefined && previousClose ? (change / previousClose) * 100 : undefined;
  return { last, change, pct };
}

/** Quotes for many symbols in one request a minute, instead of one request per row. */
export function useQuotes(ids: string[]) {
  return useQuery({ queryKey: ['quotes', ids], enabled: ids.length > 0, refetchInterval: 60_000,
    queryFn: ({ signal }) => apiFetch(`v1/quotes?ids=${encodeURIComponent(ids.join(','))}`, { schema: QuotesResponseSchema, signal })
      .then(body => new Map(body.quotes.flatMap(q => ('error' in q ? [] : [[q.instrumentId, q] as const])))) });
}
