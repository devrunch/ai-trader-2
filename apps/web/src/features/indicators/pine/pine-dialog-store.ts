import { create } from 'zustand';

export type PineDialogTab = 'editor' | 'scripts' | 'help';
/** `key` is the chart indicator being edited; Add to chart then replaces it instead of adding. */
export interface PineDialogTarget { tab: PineDialogTab; source?: string; key?: string }

interface PineDialogState {
  target: PineDialogTarget | null;
  open: (target: PineDialogTarget) => void;
  close: () => void;
}

/** Open state lives here so the picker and the legend can open the same lazily loaded dialog. */
export const usePineDialog = create<PineDialogState>(set => ({
  target: null,
  open: (target) => { set({ target }); },
  close: () => { set({ target: null }); },
}));
