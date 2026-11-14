import { create } from 'zustand';
import { isSourceRef, type IndicatorChartInputs, type IndicatorDefinition, type TemplateItem } from '@aitrader/contracts';
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
  /** The assistant's chart edits: items of this indicator whose inputs include every `match` entry; returns how many changed. */
  removeMatching: (id: string, match: InputValues) => number;
  updateMatching: (id: string, match: InputValues, inputs: InputValues) => number;
  /** Replaces the chart's indicators with a template's; fresh keys, source refs follow. */
  load: (items: readonly TemplateItem[]) => void;
}

let next = 0;
const without = (presentation: Record<string, Presentation>, key: string): Record<string, Presentation> =>
  Object.fromEntries(Object.entries(presentation).filter(([k]) => k !== key));
const matching = (items: ChartIndicator[], id: string, match: InputValues): string[] =>
  items.filter(item => item.id === id && Object.entries(match).every(([name, value]) => item.inputs[name] === value)).map(item => item.key);
const freshKey = () => `ind-${String(++next)}`;

/** The indicators on the chart with their inputs and presentation; presets and templates live on the server (FR-IN-12/14). */
export const useIndicatorStore = create<IndicatorState>((set, get) => ({
  items: [],
  presentation: {},
  add: (id, inputs = {}) => { set(state => ({ items: [...state.items, { key: freshKey(), id, inputs }] })); },
  addPine: (source, definition, inputs = {}) => { set(state => ({ items: [...state.items, { key: freshKey(), id: definition.ref, inputs, pine: { source, definition } }] })); },
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
  removeMatching: (id, match) => {
    const hit = matching(get().items, id, match);
    if (hit.length > 0) set(state => ({ items: state.items.filter(item => !hit.includes(item.key)), presentation: hit.reduce(without, state.presentation) }));
    return hit.length;
  },
  updateMatching: (id, match, inputs) => {
    const hit = matching(get().items, id, match);
    if (hit.length > 0) set(state => ({ items: state.items.map(item => (hit.includes(item.key) ? { ...item, inputs: { ...item.inputs, ...inputs } } : item)) }));
    return hit.length;
  },
  // Templates carry ids and inputs only, so a loaded set starts with each indicator's own look.
  load: templateItems => {
    const keys = new Map(templateItems.map(item => [item.key, freshKey()]));
    set({ presentation: {}, items: templateItems.map(item => ({ key: keys.get(item.key) ?? freshKey(), id: item.id,
      inputs: Object.fromEntries(Object.entries(item.inputs).map(([name, value]) => [name, isSourceRef(value) ? { ...value, from: keys.get(value.from) ?? value.from } : value])) })) });
  },
}));
