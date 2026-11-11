import { configure } from '@testing-library/react';
import { vi } from 'vitest';
// jsdom has no layout engine or viewport scrolling.
vi.stubGlobal('ResizeObserver', class {
  observe() { /* No layout in jsdom. */ }
  unobserve() { /* No layout in jsdom. */ }
  disconnect() { /* No layout in jsdom. */ }
});
window.scrollTo = () => undefined;
// findBy*/waitFor default to 1 s; the full gate runs alongside other builds, so allow 4 s before calling it a failure.
configure({ asyncUtilTimeout: 4000 });
