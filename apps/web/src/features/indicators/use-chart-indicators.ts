import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { IndicatorListResponseSchema, IndicatorResultSchema, type IndicatorDefinition, type IndicatorResult, type Interval } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';
import { ApiError } from '../../shared/api/api-error';
import { useIndicatorStore, type ChartIndicator } from './state/indicator-store';

const LIMIT = 500;

/** What the chart paints for one indicator: its definition and the latest computed series. */
interface ChartIndicatorSeries { key: string; definition: IndicatorDefinition; result: IndicatorResult }
export interface IndicatorRow { item: ChartIndicator; definition: IndicatorDefinition | undefined; result: IndicatorResult | undefined; error: string | undefined; loading: boolean }

function useIndicatorCatalog() {
  return useQuery({ queryKey: ['indicators'], staleTime: Infinity,
    queryFn: ({ signal }) => apiFetch('v1/indicators', { schema: IndicatorListResponseSchema, signal }).then(body => body.indicators) });
}

/**
 * Computes every chart indicator on the server engine (FR-IN-1). `barEpoch` changes once per new bar, so values
 * refresh on bar close; per-tick values arrive with the indicator socket (P4-5). Earlier values stay on screen while refetching.
 */
export function useChartIndicators(symbol: string, interval: Interval, barEpoch: number) {
  const items = useIndicatorStore(s => s.items);
  const catalog = useIndicatorCatalog();
  const results = useQueries({ queries: items.map(item => ({
    queryKey: ['indicator', symbol, interval, item.id, item.inputs, barEpoch],
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
