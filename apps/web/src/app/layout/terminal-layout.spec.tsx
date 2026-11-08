import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TerminalLayout } from './terminal-layout';
// FR-UI-1, FR-UI-5: responsive terminal regions.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function show(desktop: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  render(<TerminalLayout watchlist="Watchlist" chart="Chart" side={{ chat: 'Chat', positions: 'Positions', news: 'News', alerts: 'Alerts' }} />);
}
it('shows three regions on desktop', () => {
  show(true);
  for (const region of ['watchlist', 'chart', 'side']) expect(screen.getByTestId('region-' + region)).toBeDefined();
});
it('shows tabs on mobile', () => {
  show(false);
  expect(screen.getAllByRole('tab')).toHaveLength(6);
  expect(screen.getByRole('tab', { name: 'Chart' }).getAttribute('aria-selected')).toBe('true');
});
