import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { PineScriptDetailSchema, PineScriptListResponseSchema, type PineScriptDetail } from '@aitrader/contracts';
import { apiFetch } from '../../../shared/api';

const listKey = ['pine-scripts'] as const;

export function usePineScriptList() {
  return useQuery({ queryKey: listKey, queryFn: ({ signal }) => apiFetch('/v1/pine-scripts', { schema: PineScriptListResponseSchema, signal }) });
}

/** Reads one script at one version (the latest when omitted). Imperative: opening is a user action, not a view. */
export function usePineScriptOpen() {
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version?: number }): Promise<PineScriptDetail> =>
      apiFetch(`/v1/pine-scripts/${id}${version === undefined ? '' : `?version=${String(version)}`}`, { schema: PineScriptDetailSchema }),
  });
}

export function usePineScriptWrites() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: listKey });
  const create = useMutation({
    mutationFn: (body: { name: string; source: string }) => apiFetch('/v1/pine-scripts', { schema: PineScriptDetailSchema, method: 'POST', body }),
    onSuccess: refresh,
  });
  const save = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; source: string }) => apiFetch(`/v1/pine-scripts/${id}`, { schema: PineScriptDetailSchema, method: 'PUT', body }),
    onSuccess: refresh,
  });
  // DELETE answers 204 with no body, which apiFetch reads as undefined.
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/v1/pine-scripts/${id}`, { schema: z.unknown(), method: 'DELETE' }),
    onSuccess: refresh,
  });
  return { create, save, remove };
}
