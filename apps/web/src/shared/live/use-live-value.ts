import { useCallback, useSyncExternalStore } from 'react';
import type { LiveStore } from './live-store';

export function useLiveValue<V>(store: LiveStore<V>, key: string): V | undefined {
  const subscribe = useCallback((listener: () => void) => store.subscribe(key, listener), [store, key]);
  const getSnapshot = useCallback(() => store.get(key), [store, key]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
