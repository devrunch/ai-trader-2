import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { LiveStore } from '../../shared/live/live-store';
import { createManualScheduler } from '../../shared/live/frame-scheduler';

const scheduler = createManualScheduler();
const store = new LiveStore<number>(scheduler);
const subscribed: string[] = [];
vi.mock('../../shared/live/live-connection', () => ({
  prices: store,
  liveClient: () => ({ subscribe: (symbol: string) => { subscribed.push(symbol); return () => undefined; }, mergeHistory: () => undefined }),
}));

const { SymbolHeader, IntervalPicker, Watchlist } = await import('./index');
const { Providers } = await import('../../app/providers');

const quote = (id: string, price: number, change: number | null, status: object = { state: 'ok' }) =>
  ({ instrumentId: id, resolvedId: id, price, change, changePct: change === null ? null : (change / (price - change)) * 100, at: 1, status });
const popular = { query: '', results: [
  { id: 'NSE:RELIANCE', description: 'Reliance Industries', exchange: 'NSE', type: 'stock', currency: 'INR', status: 'active' },
  { id: 'NSE:TCS', description: 'Tata Consultancy Services', exchange: 'NSE', type: 'stock', currency: 'INR', status: 'active' },
] };
const server = setupServer(
  http.get('/api/v1/quote/:id', ({ params }) => HttpResponse.json(params.id === 'NSE:TCS' ? quote('NSE:TCS', 4000, -40) : quote(String(params.id), 1500, 30))),
  http.get('/api/v1/instruments/search', () => HttpResponse.json(popular)),
);
beforeAll(() => { server.listen(); });
beforeEach(() => { subscribed.length = 0; });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); });

async function renderWith(node: React.ReactNode, path = '/terminal?symbol=NSE%3ARELIANCE&interval=5') {
  const root = createRootRoute();
  const terminal = createRoute({ getParentRoute: () => root, path: '/terminal', validateSearch: (s: Record<string, unknown>) => s, component: () => node });
  const router = createRouter({ routeTree: root.addChildren([terminal]), history: createMemoryHistory({ initialEntries: [path] }),
    // Same URL handling as the app: search values stay strings.
    parseSearch: search => Object.fromEntries(new URLSearchParams(search)),
    stringifySearch: search => { const params = new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)])); const text = params.toString(); return text ? `?${text}` : ''; } });
  await router.load();
  render(<Providers><RouterProvider router={router} /></Providers>);
  return router;
}

it('symbol header shows the quote, then the live price with change from the previous close', async () => {
  await renderWith(<SymbolHeader symbol="NSE:RELIANCE" />);
  expect(await screen.findByText('1,500.00')).toBeDefined();
  expect(screen.getByText('+30.00 (+2.04%)').getAttribute('data-tone')).toBe('up');
  act(() => { store.set('price:NSE:RELIANCE', 1460); scheduler.flush(); });
  expect(screen.getByText('1,460.00')).toBeDefined();
  expect(screen.getByText('−10.00 (−0.68%)').getAttribute('data-tone')).toBe('down');
});

it('status badge says delayed or stale with the reason (FR-UI-7)', async () => {
  server.use(http.get('/api/v1/quote/:id', () => HttpResponse.json(quote('NSE:RELIANCE', 1500, 30, { state: 'stale', reason: 'MARKET_CLOSED' }))));
  await renderWith(<SymbolHeader symbol="NSE:RELIANCE" />);
  expect(await screen.findByText('Market closed')).toBeDefined();
});

it('quote errors show why and offer a retry', { timeout: 10_000 }, async () => {
  server.use(http.get('/api/v1/quote/:id', () => HttpResponse.json({ code: 'PROVIDER_DOWN', message: 'Data provider is down', requestId: 't' }, { status: 503 })));
  await renderWith(<SymbolHeader symbol="NSE:RELIANCE" />);
  expect(await screen.findByText('Data provider is down', {}, { timeout: 8_000 })).toBeDefined();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
});

it('interval picker switches interval and keeps the symbol', async () => {
  const router = await renderWith(<IntervalPicker />);
  fireEvent.click(await screen.findByRole('button', { name: '15m' }));
  await vi.waitFor(() => { expect(router.state.location.search).toMatchObject({ symbol: 'NSE:RELIANCE', interval: '15' }); });
  await vi.waitFor(() => { expect(screen.getByRole('button', { name: '15m' }).getAttribute('aria-pressed')).toBe('true'); });
});

it('watchlist streams live prices and opens a symbol on click', async () => {
  const router = await renderWith(<Watchlist />);
  expect(await screen.findByText('NSE:TCS')).toBeDefined();
  expect(subscribed.sort()).toEqual(['NSE:RELIANCE', 'NSE:TCS']);
  expect(await screen.findByText('4,000.00')).toBeDefined();
  act(() => { store.set('price:NSE:TCS', 4100); scheduler.flush(); });
  expect(screen.getByText('4,100.00')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: /NSE:TCS/ }));
  await vi.waitFor(() => { expect(router.state.location.search).toMatchObject({ symbol: 'NSE:TCS', interval: '5' }); });
});
