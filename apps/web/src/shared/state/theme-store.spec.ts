import { beforeEach, afterEach, expect, it, vi } from 'vitest';
// FR-UI-4: storage is optional and mode controls the document.
beforeEach(() => { vi.resetModules(); localStorage.clear(); delete document.documentElement.dataset.theme; });
afterEach(() => vi.restoreAllMocks());
it('defaults to system', async () => {
  const { useThemeStore } = await import('./theme-store');
  expect(useThemeStore.getState().mode).toBe('system');
});
it('persists and applies dark', async () => {
  const { useThemeStore } = await import('./theme-store');
  useThemeStore.getState().setMode('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem('aitrader.theme')).toBe('dark');
});
it('theme store survives throwing localStorage', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  const { useThemeStore } = await import('./theme-store');
  expect(useThemeStore.getState().mode).toBe('system');
  expect(() => { useThemeStore.getState().setMode('dark'); }).not.toThrow();
  expect(document.documentElement.dataset.theme).toBe('dark');
});
