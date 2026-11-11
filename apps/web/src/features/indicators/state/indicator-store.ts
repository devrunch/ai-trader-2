import { create } from 'zustand';
import type { IndicatorChartInputs } from '@aitrader/contracts';
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
}

let next = 0;
const without = (presentation: Record<string, Presentation>, key: string): Record<string, Presentation> =>
  Object.fromEntries(Object.entries(presentation).filter(([k]) => k !== key));

/** The indicators on the chart with their inputs and presentation; templates and presets persist on the server later (FR-IN-12/14). */
export const useIndicatorStore = create<IndicatorState>(set => ({
  items: [],
  presentation: {},
  add: (id, inputs = {}) => { set(state => ({ items: [...state.items, { key: `ind-${String(++next)}`, id, inputs }] })); },
  update: (key, inputs) => { set(state => ({ items: state.items.map(item => (item.key === key ? { ...item, inputs } : item)) })); },
  setPresentation: (key, presentation) => {
    set(state => ({ presentation: presentation ? { ...without(state.presentation, key), [key]: presentation } : without(state.presentation, key) }));
  },
  remove: key => { set(state => ({ items: state.items.filter(item => item.key !== key), presentation: without(state.presentation, key) })); },
}));
