import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { BacktestRunResponseSchema, StrategyListResponseSchema, StrategySchema, type BacktestSpec } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';

const KEY = ['strategies'];

export function useStrategies() {
  return useQuery({ queryKey: KEY, queryFn: ({ signal }) => apiFetch('/v1/strategies', { schema: StrategyListResponseSchema, signal }) });
}

export function useStrategyActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: KEY });
  const save = useMutation({ retry: 0, onSettled: refresh,
    mutationFn: ({ id, name, spec }: { id: string | null; name: string; spec: BacktestSpec }) => id
      ? apiFetch(`/v1/strategies/${id}`, { method: 'PUT', body: { name, spec }, schema: StrategySchema })
      : apiFetch('/v1/strategies', { method: 'POST', body: { name, spec }, schema: StrategySchema }) });
  const remove = useMutation({ retry: 0, onSettled: refresh,
    mutationFn: (id: string) => apiFetch(`/v1/strategies/${id}`, { method: 'DELETE', schema: z.object({ deleted: z.boolean() }) }) });
  const run = useMutation({ retry: 0, onSettled: refresh,
    mutationFn: ({ strategyId, spec }: { strategyId: string | null; spec: BacktestSpec }) =>
      apiFetch('/v1/strategies/run', { method: 'POST', body: { ...(strategyId ? { strategyId } : {}), spec }, schema: BacktestRunResponseSchema }) });
  return { save, remove, run };
}
