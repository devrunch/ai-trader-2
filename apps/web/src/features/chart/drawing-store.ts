import { create } from 'zustand';
import type { Drawing } from '@aitrader/contracts';

interface DrawingState {
  items: { id: string; drawing: Drawing }[];
  add: (id: string, drawing: Drawing) => void;
  clear: (symbol: string, interval: string) => void;
}

/** Drawings applied from assistant cards, keyed by card id so applying twice draws once. */
export const useDrawingStore = create<DrawingState>(set => ({
  items: [],
  add: (id, drawing) => { set(state => ({ items: [...state.items.filter(item => item.id !== id), { id, drawing }] })); },
  clear: (symbol, interval) => { set(state => ({ items: state.items.filter(item => item.drawing.symbol !== symbol || item.drawing.interval !== interval) })); },
}));
