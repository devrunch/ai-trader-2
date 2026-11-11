import { create } from 'zustand';
import type { IndicatorInputValues } from '@aitrader/contracts';

export type InputValues = IndicatorInputValues;
export interface ChartIndicator { key: string; id: string; inputs: InputValues }

interface IndicatorState {
  items: ChartIndicator[];
  add: (id: string, inputs?: InputValues) => void;
  update: (key: string, inputs: InputValues) => void;
  remove: (key: string) => void;
}

let next = 0;
/** The indicators on the chart and their inputs; templates and presets persist on the server later (FR-IN-12/14). */
export const useIndicatorStore = create<IndicatorState>(set => ({
  items: [],
  add: (id, inputs = {}) => { set(state => ({ items: [...state.items, { key: `ind-${String(++next)}`, id, inputs }] })); },
  update: (key, inputs) => { set(state => ({ items: state.items.map(item => (item.key === key ? { ...item, inputs } : item)) })); },
  remove: key => { set(state => ({ items: state.items.filter(item => item.key !== key) })); },
}));
