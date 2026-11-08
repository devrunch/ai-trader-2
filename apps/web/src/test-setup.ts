import { vi } from 'vitest';
// jsdom has no layout engine or viewport scrolling.
vi.stubGlobal('ResizeObserver', class {
  observe() { /* No layout in jsdom. */ }
  unobserve() { /* No layout in jsdom. */ }
  disconnect() { /* No layout in jsdom. */ }
});
window.scrollTo = () => undefined;
