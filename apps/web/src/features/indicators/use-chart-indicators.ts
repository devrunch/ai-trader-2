import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { IndicatorListResponseSchema, IndicatorResultSchema, type IndicatorDefinition, type IndicatorResult, type Interval } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';
import { ApiError } from '../../shared/api/api-error';
import { useIndicatorStore, type ChartIndicator } from './state/indicator-store';

const LIMIT = 500;

/** What the chart paints for one indicator: its definition and the latest computed series. */
interface ChartIndicatorSeries { key: string; definition: IndicatorDefinition; result: IndicatorResult }
export interface IndicatorRow { item: ChartIndicator; definition: IndicatorDefinition | undefined; result: IndicatorResult | undefined; error: string | undefined; loading: boolean }

export function useIndicatorCatalog() {
  return useQuery({ queryKey: ['indicators'], staleTime: Infinity,
    queryFn: ({ signal }) => apiFetch('v1/indicators', { schema: IndicatorListResponseSchema, signal }).then(body => body.indicators) });
}

/** The query key of one chart indicator's series; live resets from the socket write the fresh series here. */
export const indicatorQueryKey = (symbol: string, interval: Interval, item: ChartIndicator) => ['indicator', symbol, interval, item.id, item.inputs] as const;

/**
 * The first paint of every chart indicator, computed on the server engine over HTTP (FR-IN-1), so it shows even when the
 * socket is down. Per-tick values then come over the socket (P4-5) and go straight to the chart.
 */
export function useChartIndicators(symbol: string, interval: Interval) {
  const items = useIndicatorStore(s => s.items);
  const catalog = useIndicatorCatalog();
  const results = useQueries({ queries: items.map(item => ({
    queryKey: indicatorQueryKey(symbol, interval, item),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch('v1/indicators/compute', { method: 'POST', schema: IndicatorResultSchema, signal,
      body: { symbol, interval, indicator: { kind: 'builtin', id: item.id, inputs: item.inputs }, range: { limit: LIMIT } } }),
  })) });
  const rows: IndicatorRow[] = items.map((item, i) => {
    const query = results[i];
    const error = query?.error;
    return { item, definition: catalog.data?.find(d => d.id === item.id), result: query?.data, loading: query?.isPending ?? true,
      error: error ? (error instanceof ApiError ? error.message : 'Indicator failed to load') : undefined };
  });
  const series: ChartIndicatorSeries[] = rows.flatMap(row => (row.definition && row.result ? [{ key: row.item.key, definition: row.definition, result: row.result }] : []));
  return { rows, series, catalog };
}
