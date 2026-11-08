import { z } from 'zod';
import { safeStorage } from '../../shared/state/safe-storage';

const key = 'aitrader.recentSymbols';
function get(): string[] {
  try {
    const parsed = z.array(z.string()).safeParse(JSON.parse(safeStorage.get(key) ?? '[]'));
    return parsed.success ? [...new Set(parsed.data)].slice(0, 10) : [];
  } catch { return []; }
}
export const recentSymbols = {
  get,
  push(id: string) { safeStorage.set(key, JSON.stringify([id, ...get().filter((previous) => previous !== id)].slice(0, 10))); },
};
