import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { IndicatorListResponseSchema, IndicatorResultSchema, type IndicatorDefinition, type IndicatorResult, type Interval } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';
import { ApiError } from '../../shared/api/api-error';
import { chainOthers, indicatorLabel, parentKeyOf, sourceUnavailable } from './source-refs';
import { useIndicatorStore, type ChartIndicator } from './state/indicator-store';

const LIMIT = 500;

/** What the chart paints for one indicator: its definition and the latest computed series. */
interface ChartIndicatorSeries { key: string; definition: IndicatorDefinition; result: IndicatorResult; /** The indicator whose plot is this one's source; it paints on that pane by default. */ parentKey: string | undefined }
export const SOURCE_UNAVAILABLE = 'Source unavailable';
export interface IndicatorRow { item: ChartIndicator; definition: IndicatorDefinition | undefined; result: IndicatorResult | undefined; error: string | undefined; loading: boolean }

export function useIndicatorCatalog() {
  return useQuery({ queryKey: ['indicators'], staleTime: Infinity,
    queryFn: ({ signal }) => apiFetch('v1/indicators', { schema: IndicatorListResponseSchema, signal }).then(body => body.indicators) });
}

/** The query key of one chart indicator's series; live resets from the socket write the fresh series here. */
export const indicatorQueryKey = (symbol: string, interval: Interval, item: ChartIndicator, items: readonly ChartIndicator[] = [item]) =>
  ['indicator', symbol, interval, item.id, item.inputs, chainOthers(items, item, undefined).map(o => o.indicator)] as const;

/**
 * The first paint of every chart indicator, computed on the server engine over HTTP (FR-IN-1), so it shows even when the
 * socket is down. Per-tick values then come over the socket (P4-5) and go straight to the chart.
 */
export function useChartIndicators(symbol: string, interval: Interval) {
  const items = useIndicatorStore(s => s.items);
  const catalog = useIndicatorCatalog();
  const results = useQueries({ queries: items.map(item => ({
    queryKey: indicatorQueryKey(symbol, interval, item, items),
    placeholderData: keepPreviousData,
    // A chained request names its indicators in error messages, so it waits for the catalog's names.
    enabled: !sourceUnavailable(items, item, new Set()) && (parentKeyOf(item) === undefined || catalog.data !== undefined),
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const others = chainOthers(items, item, catalog.data);
      return apiFetch('v1/indicators/compute', { method: 'POST', schema: IndicatorResultSchema, signal, body: { symbol, interval,
        indicator: { kind: 'builtin', id: item.id, inputs: item.inputs }, range: { limit: LIMIT },
        ...(parentKeyOf(item) !== undefined && { instanceId: item.key, label: indicatorLabel(catalog.data?.find(d => d.id === item.id), item), others }) } });
    },
  })) });
  // A child whose parent is gone or failed shows "source unavailable" and paints nothing, never the last good values (E28).
  const failed = new Set(items.filter((_, i) => results[i]?.error).map(item => item.key));
  const rows: IndicatorRow[] = items.map((item, i) => {
    const query = results[i];
    const error = query?.error;
    const unavailable = sourceUnavailable(items, item, failed);
    return { item, definition: catalog.data?.find(d => d.id === item.id), result: unavailable ? undefined : query?.data, loading: !unavailable && (query?.isPending ?? true),
      error: unavailable ? SOURCE_UNAVAILABLE : error ? (error instanceof ApiError ? error.message : 'Indicator failed to load') : undefined };
  });
  const series: ChartIndicatorSeries[] = rows.flatMap(row => (row.definition && row.result
    ? [{ key: row.item.key, definition: row.definition, result: row.result, parentKey: parentKeyOf(row.item) }] : []));
  return { rows, series, catalog };
}
