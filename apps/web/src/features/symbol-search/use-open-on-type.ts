import { useEffect } from 'react';

export function useOpenOnType(open: (initial: string) => void) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!/^[A-Za-z0-9]$/.test(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      event.preventDefault();
      open(event.key);
    }
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); };
  }, [open]);
}
