import { create } from 'zustand';
import { safeStorage } from './safe-storage';
type Mode = 'system' | 'light' | 'dark';
function apply(mode: Mode) {
  if (typeof document === 'undefined') return;
  if (mode === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
}
const saved = safeStorage.get('aitrader.theme');
const mode: Mode = saved === 'light' || saved === 'dark' ? saved : 'system';
apply(mode);
export const useThemeStore = create<{ mode: Mode; setMode: (mode: Mode) => void }>((set) => ({
  mode,
  setMode(mode) {
    safeStorage.set('aitrader.theme', mode);
    apply(mode);
    set({ mode });
  },
}));
