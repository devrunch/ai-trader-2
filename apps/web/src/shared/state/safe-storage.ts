export const safeStorage = {
  get(key: string): string | null {
    try { return globalThis.localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string): void {
    try { globalThis.localStorage.setItem(key, value); } catch { /* Storage is optional. */ }
  },
  remove(key: string): void {
    try { globalThis.localStorage.removeItem(key); } catch { /* Storage is optional. */ }
  },
};
