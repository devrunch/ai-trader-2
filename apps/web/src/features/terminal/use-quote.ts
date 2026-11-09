import { useQuery } from '@tanstack/react-query';
import { QuoteResponseSchema } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';
import { prices, useLiveValue } from '../../shared/live';

function useQuote(symbol: string) {
  return useQuery({ queryKey: ['quote', symbol], refetchInterval: 60_000,
    queryFn: ({ signal }) => apiFetch(`v1/quote/${encodeURIComponent(symbol)}`, { schema: QuoteResponseSchema, signal }) });
}

/** Last price (live when streaming, else the quote) and change against the previous close. */
export function useLivePrice(symbol: string) {
  const quote = useQuote(symbol);
  const live = useLiveValue(prices, `price:${symbol}`);
  const data = quote.data;
  const last = live ?? data?.price;
  const previousClose = data && data.change !== null ? data.price - data.change : undefined;
  const change = last !== undefined && previousClose !== undefined ? last - previousClose : undefined;
  const pct = change !== undefined && previousClose ? (change / previousClose) * 100 : undefined;
  return { quote, last, change, pct };
}
