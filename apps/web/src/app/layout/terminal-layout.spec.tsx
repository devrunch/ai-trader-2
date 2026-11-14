import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../shared/ui/tooltip';
import { TerminalLayout } from './terminal-layout';
// FR-UI-1, FR-UI-5: responsive terminal regions.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function show(desktop: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  render(<TooltipProvider><TerminalLayout toolbar="Toolbar" chart="Chart" bottom="Trading" widgets={{ watchlist: 'Watchlist', depth: 'Book', assistant: 'Chat', news: 'News', options: 'Options', alerts: 'Alerts' }} /></TooltipProvider>);
}
it('shows the chart, the trading panel and one widget on desktop; the rail toggles the widget', () => {
  show(true);
  for (const region of ['chart', 'bottom', 'side']) expect(screen.getByTestId('region-' + region)).toBeDefined();
  expect(screen.getByTestId('region-side').textContent).toContain('Watchlist');
  fireEvent.click(screen.getByRole('button', { name: 'Assistant' }));
  expect(screen.getByTestId('region-side').textContent).toContain('Chat');
  fireEvent.click(screen.getByRole('button', { name: 'Assistant' }));
  expect(screen.queryByTestId('region-side')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse trading panel' }));
  expect(screen.queryByTestId('region-bottom')).toBeNull();
});
it('shows tabs on mobile', () => {
  show(false);
  expect(screen.getAllByRole('tab')).toHaveLength(8);
  expect(screen.getByRole('tab', { name: 'Chart' }).getAttribute('aria-selected')).toBe('true');
});
