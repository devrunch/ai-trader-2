import { create } from 'zustand';
import { isSourceRef, type IndicatorChartInputs, type TemplateItem } from '@aitrader/contracts';
import type { Presentation } from '../style';

export type InputValues = IndicatorChartInputs;
export interface ChartIndicator { key: string; id: string; inputs: InputValues }

interface IndicatorState {
  items: ChartIndicator[];
  /** Style and visibility by item key; absent means the built-in's defaults. Kept apart from `items` so a repaint never touches the compute or the socket. */
  presentation: Record<string, Presentation>;
  add: (id: string, inputs?: InputValues) => void;
  update: (key: string, inputs: InputValues) => void;
  setPresentation: (key: string, presentation: Presentation | undefined) => void;
  remove: (key: string) => void;
  /** Replaces the chart's indicators with a template's; fresh keys, source refs follow. */
  load: (items: readonly TemplateItem[]) => void;
}

let next = 0;
const without = (presentation: Record<string, Presentation>, key: string): Record<string, Presentation> =>
  Object.fromEntries(Object.entries(presentation).filter(([k]) => k !== key));
const freshKey = () => `ind-${String(++next)}`;

/** The indicators on the chart with their inputs and presentation; presets and templates live on the server (FR-IN-12/14). */
export const useIndicatorStore = create<IndicatorState>(set => ({
  items: [],
  presentation: {},
  add: (id, inputs = {}) => { set(state => ({ items: [...state.items, { key: freshKey(), id, inputs }] })); },
  update: (key, inputs) => { set(state => ({ items: state.items.map(item => (item.key === key ? { ...item, inputs } : item)) })); },
  setPresentation: (key, presentation) => {
    set(state => ({ presentation: presentation ? { ...without(state.presentation, key), [key]: presentation } : without(state.presentation, key) }));
  },
  remove: key => { set(state => ({ items: state.items.filter(item => item.key !== key), presentation: without(state.presentation, key) })); },
  // Templates carry ids and inputs only, so a loaded set starts with each indicator's own look.
  load: templateItems => {
    const keys = new Map(templateItems.map(item => [item.key, freshKey()]));
    set({ presentation: {}, items: templateItems.map(item => ({ key: keys.get(item.key) ?? freshKey(), id: item.id,
      inputs: Object.fromEntries(Object.entries(item.inputs).map(([name, value]) => [name, isSourceRef(value) ? { ...value, from: keys.get(value.from) ?? value.from } : value])) })) });
  },
}));
