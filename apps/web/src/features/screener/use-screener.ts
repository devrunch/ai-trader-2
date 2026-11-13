import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { SavedScreenListSchema, SavedScreenSchema, ScanResultSchema, ScreenPresetListSchema, UniverseListSchema, type ScreenSpec } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';

const SAVED = ['screener', 'screens'];

export function useUniverses() {
  return useQuery({ queryKey: ['screener', 'universes'], queryFn: ({ signal }) => apiFetch('/v1/screener/universes', { schema: UniverseListSchema, signal }) });
}
export function usePresets() {
  return useQuery({ queryKey: ['screener', 'presets'], queryFn: ({ signal }) => apiFetch('/v1/screener/presets', { schema: ScreenPresetListSchema, signal }) });
}
export function useSavedScreens() {
  return useQuery({ queryKey: SAVED, queryFn: ({ signal }) => apiFetch('/v1/screener/screens', { schema: SavedScreenListSchema, signal }) });
}

export function useScan() {
  return useMutation({ retry: 0, mutationFn: (spec: ScreenSpec) => apiFetch('/v1/screener/scan', { method: 'POST', body: { spec }, schema: ScanResultSchema }) });
}

export function useScreenActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: SAVED });
  const create = useMutation({ retry: 0, onSettled: refresh,
    mutationFn: (v: { name: string; spec: ScreenSpec }) => apiFetch('/v1/screener/screens', { method: 'POST', body: v, schema: SavedScreenSchema }) });
  const rename = useMutation({ retry: 0, onSettled: refresh,
    mutationFn: (v: { id: string; name: string }) => apiFetch(`/v1/screener/screens/${v.id}`, { method: 'PUT', body: { name: v.name }, schema: SavedScreenSchema }) });
  const remove = useMutation({ retry: 0, onSettled: refresh,
    mutationFn: (id: string) => apiFetch(`/v1/screener/screens/${id}`, { method: 'DELETE', schema: z.object({ deleted: z.boolean() }) }) });
  return { create, rename, remove };
}
