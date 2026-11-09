import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { Providers } from '../providers';
import { createAppRouter } from '../router';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
// Routing tests: no canvas in jsdom and no real socket, so the chart and the connection are stand-ins.
vi.mock('../../features/chart/lwc-chart', () => ({ createLwcChart: () => ({
  candles: { setData: () => undefined, update: () => undefined }, volume: { setData: () => undefined, update: () => undefined },
  onVisibleRange: () => () => undefined, applyColors: () => undefined, remove: () => undefined,
}) }));
vi.mock('../../shared/live/live-connection', async () => {
  const { LiveStore } = await import('../../shared/live/live-store');
  return { prices: new LiveStore<number>(), liveClient: () => ({ subscribe: () => () => undefined, mergeHistory: () => undefined }) };
});
// FR-UI-3, FR-UI-5: canonical symbol and interval survive navigation.
afterEach(cleanup);
async function visit(url: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [url] }));
  await router.load();
  render(<Providers><RouterProvider router={router} /></Providers>);
  return router;
}
it('reads symbol and interval from the URL', async () => {
  await visit('/terminal?symbol=NSE:RELIANCE&interval=15');
  expect(await screen.findByRole('button', { name: 'NSE:RELIANCE' })).toBeDefined();
  expect(screen.getByRole('button', { name: '15m' }).getAttribute('aria-pressed')).toBe('true');
});
// FR-SY-6, FR-UI-9: selection keeps the existing interval.
it('Enter navigates to the selected symbol keeping interval', async () => {
  // cmdk scrolls the active row; jsdom has no layout engine.
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => undefined });
  const server = setupServer(http.get('/api/v1/instruments/search', () => HttpResponse.json({ query: 'r', results: [{ id: 'NSE:RELIANCE', description: 'Reliance Industries', exchange: 'NSE', type: 'stock', currency: 'INR', status: 'active' }] })));
  server.listen();
  try {
    const router = await visit('/terminal?symbol=NSE:NIFTY&interval=15');
    await screen.findByRole('button', { name: 'NSE:NIFTY' });
    fireEvent.keyDown(document.body, { key: 'r' });
    const input = await screen.findByPlaceholderText('Search symbols'); expect(input.getAttribute('value')).toBe('r');
    await within(await screen.findByRole('dialog')).findByText('Reliance Industries'); fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => { expect(router.state.location.search).toEqual({ symbol: 'NSE:RELIANCE', interval: '15' }); });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'NSE:RELIANCE' }));
    expect(await screen.findByText('Recent symbols')).toBeDefined();
    fireEvent.keyDown(screen.getByPlaceholderText('Search symbols'), { key: 'Escape' });
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
  } finally { server.close(); Reflect.deleteProperty(Element.prototype, 'scrollIntoView'); }
});
it('terminal URLs use plain search params', async () => {
  const router = await visit('/terminal');
  await router.navigate({ to: '/terminal', search: { symbol: 'NSE:RELIANCE', interval: '15' } });
  expect(router.state.location.searchStr).toMatch(/symbol=NSE(?:%3A|:)RELIANCE&interval=15/);
  expect(router.state.location.searchStr).not.toMatch(/%22|"/);
});
it('falls back to defaults on invalid search', async () => {
  await visit('/terminal?symbol=bad&interval=7');
  expect(await screen.findByRole('button', { name: 'NSE:NIFTY' })).toBeDefined();
  expect(screen.getByRole('button', { name: '5m' }).getAttribute('aria-pressed')).toBe('true');
});
