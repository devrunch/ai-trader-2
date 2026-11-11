import { create } from 'zustand';
import { isSourceRef, type IndicatorChartInputs, type TemplateItem } from '@aitrader/contracts';

export type InputValues = IndicatorChartInputs;
export interface ChartIndicator { key: string; id: string; inputs: InputValues }

interface IndicatorState {
  items: ChartIndicator[];
  add: (id: string, inputs?: InputValues) => void;
  update: (key: string, inputs: InputValues) => void;
  remove: (key: string) => void;
  /** Replaces the chart's indicators with a template's; fresh keys, source refs follow. */
  load: (items: readonly TemplateItem[]) => void;
}

let next = 0;
const freshKey = () => `ind-${String(++next)}`;

/** The indicators on the chart and their inputs; presets and templates live on the server (FR-IN-12/14). */
export const useIndicatorStore = create<IndicatorState>(set => ({
  items: [],
  add: (id, inputs = {}) => { set(state => ({ items: [...state.items, { key: freshKey(), id, inputs }] })); },
  update: (key, inputs) => { set(state => ({ items: state.items.map(item => (item.key === key ? { ...item, inputs } : item)) })); },
  remove: key => { set(state => ({ items: state.items.filter(item => item.key !== key) })); },
  load: templateItems => {
    const keys = new Map(templateItems.map(item => [item.key, freshKey()]));
    set({ items: templateItems.map(item => ({ key: keys.get(item.key) ?? freshKey(), id: item.id,
      inputs: Object.fromEntries(Object.entries(item.inputs).map(([name, value]) => [name, isSourceRef(value) ? { ...value, from: keys.get(value.from) ?? value.from } : value])) })) });
  },
}));
