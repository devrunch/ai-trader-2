import { create } from 'zustand';
import type { IndicatorChartInputs, IndicatorDefinition } from '@aitrader/contracts';
import type { Presentation } from '../style';

export type InputValues = IndicatorChartInputs;
export interface ChartIndicator { key: string; id: string; inputs: InputValues; /** A Pine script on the chart; `id` is then the definition's ref, which never collides with a built-in's id. */ pine?: { source: string; definition: IndicatorDefinition } }

interface IndicatorState {
  items: ChartIndicator[];
  /** Style and visibility by item key; absent means the built-in's defaults. Kept apart from `items` so a repaint never touches the compute or the socket. */
  presentation: Record<string, Presentation>;
  add: (id: string, inputs?: InputValues) => void;
  addPine: (source: string, definition: IndicatorDefinition, inputs?: InputValues) => void;
  /** Swaps the script of an item, keeping its key and look; inputs the new script no longer declares are dropped. */
  replacePine: (key: string, source: string, definition: IndicatorDefinition) => void;
  update: (key: string, inputs: InputValues) => void;
  setPresentation: (key: string, presentation: Presentation | undefined) => void;
  remove: (key: string) => void;
}

let next = 0;
const without = (presentation: Record<string, Presentation>, key: string): Record<string, Presentation> =>
  Object.fromEntries(Object.entries(presentation).filter(([k]) => k !== key));

/** The indicators on the chart with their inputs and presentation; templates and presets persist on the server later (FR-IN-12/14). */
export const useIndicatorStore = create<IndicatorState>(set => ({
  items: [],
  presentation: {},
  add: (id, inputs = {}) => { set(state => ({ items: [...state.items, { key: `ind-${String(++next)}`, id, inputs }] })); },
  addPine: (source, definition, inputs = {}) => { set(state => ({ items: [...state.items, { key: `ind-${String(++next)}`, id: definition.ref, inputs, pine: { source, definition } }] })); },
  replacePine: (key, source, definition) => {
    const known = new Set(definition.inputs.map(def => def.id));
    set(state => ({ items: state.items.map(item => (item.key === key
      ? { ...item, id: definition.ref, pine: { source, definition }, inputs: Object.fromEntries(Object.entries(item.inputs).filter(([id]) => known.has(id))) } : item)) }));
  },
  update: (key, inputs) => { set(state => ({ items: state.items.map(item => (item.key === key ? { ...item, inputs } : item)) })); },
  setPresentation: (key, presentation) => {
    set(state => ({ presentation: presentation ? { ...without(state.presentation, key), [key]: presentation } : without(state.presentation, key) }));
  },
  remove: key => { set(state => ({ items: state.items.filter(item => item.key !== key), presentation: without(state.presentation, key) })); },
}));
