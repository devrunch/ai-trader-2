import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  IndicatorPresetListSchema, IndicatorPresetSchema, IndicatorTemplateListSchema, IndicatorTemplateSchema, isSourceRef,
  type IndicatorInputValues, type IndicatorPreset, type IndicatorTemplate, type TemplateItem,
} from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';
import type { InputValues } from './state/indicator-store';

const PRESETS = ['indicators', 'presets'];
const TEMPLATES = ['indicators', 'templates'];
const presetBody = z.strictObject({ preset: IndicatorPresetSchema });
const templateBody = z.strictObject({ template: IndicatorTemplateSchema });
const none = z.unknown();

/** Presets hold plain values; a source pointing at another indicator on the chart has no meaning elsewhere. */
export function plainInputs(values: InputValues): IndicatorInputValues {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string | number | boolean] => !isSourceRef(entry[1])));
}

export const defaultOf = (presets: readonly IndicatorPreset[] | undefined, indicatorId: string): IndicatorPreset | undefined =>
  presets?.find(p => p.indicatorId === indicatorId && p.name === null);

export function useIndicatorPresets() {
  return useQuery({ queryKey: PRESETS, staleTime: 60_000,
    queryFn: ({ signal }) => apiFetch('v1/indicators/presets', { schema: IndicatorPresetListSchema, signal }).then(body => body.presets) });
}

export function useSavePreset() {
  const client = useQueryClient();
  return useMutation({ retry: 0,
    mutationFn: ({ indicatorId, name, inputs }: { indicatorId: string; name: string | null; inputs: IndicatorInputValues }) => (name === null
      ? apiFetch(`v1/indicators/presets/defaults/${indicatorId}`, { method: 'PUT', body: { inputs }, schema: presetBody })
      : apiFetch('v1/indicators/presets', { method: 'POST', body: { indicatorId, name, inputs }, schema: presetBody })),
    onSettled: () => client.invalidateQueries({ queryKey: PRESETS }) });
}

export function useIndicatorTemplates() {
  return useQuery({ queryKey: TEMPLATES, staleTime: 60_000,
    queryFn: ({ signal }) => apiFetch('v1/indicators/templates', { schema: IndicatorTemplateListSchema, signal }).then(body => body.templates) });
}

export function useTemplateActions() {
  const client = useQueryClient();
  const settled = { onSettled: () => client.invalidateQueries({ queryKey: TEMPLATES }) };
  const create = useMutation({ retry: 0, ...settled,
    mutationFn: ({ name, items }: { name: string; items: TemplateItem[] }) => apiFetch('v1/indicators/templates', { method: 'POST', body: { name, items }, schema: templateBody }) });
  const favourite = useMutation({ retry: 0, ...settled,
    mutationFn: ({ id, favourite: value }: { id: string; favourite: boolean }) => apiFetch(`v1/indicators/templates/${id}`, { method: 'PATCH', body: { favourite: value }, schema: templateBody }) });
  const remove = useMutation({ retry: 0, ...settled, mutationFn: (id: string) => apiFetch(`v1/indicators/templates/${id}`, { method: 'DELETE', schema: none }) });
  return { create, favourite, remove };
}

export const byFavourite = (templates: readonly IndicatorTemplate[]): IndicatorTemplate[] =>
  [...templates].sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name));
