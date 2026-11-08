import { useSyncExternalStore } from 'react';
const query = '(min-width: 768px)';
function subscribe(onChange: () => void) {
  if (typeof matchMedia === 'undefined') return () => undefined;
  const media = matchMedia(query);
  media.addEventListener('change', onChange);
  return () => { media.removeEventListener('change', onChange); };
}
function snapshot() { return typeof matchMedia === 'undefined' || matchMedia(query).matches; }
export function useIsDesktop() { return useSyncExternalStore(subscribe, snapshot, () => true); }
