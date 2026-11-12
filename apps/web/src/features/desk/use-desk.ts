import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DeskBacktestListSchema, DeskBacktestSchema, DeskEstimateSchema, DeskRunListSchema, DeskRunSchema, type DeskBacktestDto, type DeskBacktestRequest, type DeskRunDto } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';

const POLL_MS = 3000;

export function useDeskRuns(symbol: string) {
  return useQuery({ queryKey: ['desk', 'runs', symbol], queryFn: ({ signal }) => apiFetch(`/v1/desk/runs?symbol=${encodeURIComponent(symbol)}&limit=20`, { schema: DeskRunListSchema, signal }) });
}

export function useRunDesk() {
  const client = useQueryClient();
  return useMutation({ retry: 0, onSettled: () => client.invalidateQueries({ queryKey: ['desk', 'runs'] }),
    mutationFn: (body: { symbol: string; rounds: number; asOf?: string }): Promise<DeskRunDto> => apiFetch('/v1/desk/runs', { method: 'POST', body, schema: DeskRunSchema }) });
}

export function useDeskBacktests(symbol: string) {
  return useQuery({ queryKey: ['desk', 'backtests', symbol], queryFn: ({ signal }) => apiFetch(`/v1/desk/backtests?symbol=${encodeURIComponent(symbol)}`, { schema: DeskBacktestListSchema, signal }) });
}

export function useDeskBacktest(id: string | null) {
  return useQuery<DeskBacktestDto>({ queryKey: ['desk', 'backtest', id], enabled: id !== null,
    refetchInterval: query => (query.state.data?.status === 'running' ? POLL_MS : false),
    queryFn: ({ signal }) => apiFetch(`/v1/desk/backtests/${id ?? ''}`, { schema: DeskBacktestSchema, signal }) });
}

export function useBacktestActions() {
  const client = useQueryClient();
  const estimate = useMutation({ retry: 0, mutationFn: (body: DeskBacktestRequest) => apiFetch('/v1/desk/backtests/estimate', { method: 'POST', body, schema: DeskEstimateSchema }) });
  const start = useMutation({ retry: 0, onSettled: () => client.invalidateQueries({ queryKey: ['desk', 'backtests'] }),
    mutationFn: (body: DeskBacktestRequest) => apiFetch('/v1/desk/backtests', { method: 'POST', body, schema: DeskBacktestSchema }),
    onSuccess: created => { client.setQueryData(['desk', 'backtest', created.id], created); } });
  return { estimate, start };
}
