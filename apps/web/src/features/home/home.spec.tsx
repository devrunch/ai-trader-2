import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { Providers } from '../../app/providers';
import { HomePage } from './index';

const quote = (id: string, price: number, changePct: number) => ({ instrumentId: id, resolvedId: id, price, change: 1, changePct, at: 1, status: { state: 'ok' } });
let briefs = 0;
let follows = 0;
const watchList = (taskId: string | null) => ({ id: 'w1', createdAt: '2026-11-16T03:00:00.000Z', record: { right: 3, wrong: 2, total: 5 }, items: [{
  id: 'i1', title: 'Reliance may follow crude higher', why: 'Crude is up 1.2% after a stock draw; Reliance usually follows.', symbols: ['NSE:RELIANCE'], direction: 'up',
  confidence: 0.6, horizon: 'today', follow: { symbol: 'NSE:RELIANCE', op: 'above', value: 1350 }, refPrices: { 'NSE:RELIANCE': 1340 }, outcome: 'open', movePct: null, resolvedAt: null, taskId }] });
const server = setupServer(
  http.get('/api/v1/watchlist', () => HttpResponse.json({ items: ['NSE:NIFTY', 'OANDA:XAUUSD'], custom: true })),
  http.get('/api/v1/quotes', () => HttpResponse.json({ quotes: [quote('NSE:NIFTY', 25255.05, 0.84), quote('OANDA:XAUUSD', 4012.5, -0.31)] })),
  http.get('/api/v1/calendar', () => HttpResponse.json({ events: [{ id: 'e1', title: 'CPI m/m', country: 'USD', at: '2026-11-12T13:30:00.000Z', impact: 'High',
    forecast: '0.3%', previous: '0.4%', moves: ['US stocks', 'Gold', 'USD/INR'] }] })),
  http.get('/api/v1/news', () => HttpResponse.json({ items: [{ id: 'n1', source: 'Reuters', title: 'Oil climbs on supply cuts', url: 'https://example.com/a',
    summary: null, publishedAt: new Date().toISOString(), symbols: ['MCX:CRUDEOIL1!'], impact: 'low', moves: [], direction: null }] })),
  http.get('/api/v1/paper/accounts', () => HttpResponse.json({ accounts: [
    { id: 'a', currency: 'INR', initialCash: 1e6, cash: 1e6, usedMargin: 0, available: 998_663, realisedPnl: -52, charges: 3 }] })),
  http.get('/api/v1/agent/tasks', () => HttpResponse.json([])),
  http.get('/api/v1/what-to-watch', () => HttpResponse.json({ list: null, canRefreshAt: null })),
  http.post('/api/v1/what-to-watch/refresh', () => { briefs++; return HttpResponse.json({ list: watchList(null), canRefreshAt: null }); }),
  http.post('/api/v1/what-to-watch/items/:id/follow', () => { follows++; return HttpResponse.json({ list: watchList('task-1'), canRefreshAt: null }); }),
);
beforeAll(() => { server.listen(); });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); });

async function renderHome() {
  const root = createRootRoute();
  const home = createRoute({ getParentRoute: () => root, path: '/', component: HomePage });
  const terminal = createRoute({ getParentRoute: () => root, path: '/terminal', validateSearch: (s: Record<string, unknown>) => s, component: () => <p>terminal</p> });
  const router = createRouter({ routeTree: root.addChildren([home, terminal]), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await router.load();
  render(<Providers><RouterProvider router={router} /></Providers>);
  return router;
}

it('shows the user\'s markets, the day\'s releases with what they move, headlines and paper accounts', async () => {
  const router = await renderHome();
  // Quotes follow the watchlist fetch; allow for a loaded machine.
  expect(await screen.findByText('25,255.05', {}, { timeout: 5000 })).toBeDefined();
  expect(screen.getByText('CPI m/m')).toBeDefined();
  expect(await screen.findByText('Moves: US stocks, Gold, USD/INR')).toBeDefined();
  expect(await screen.findByText('Oil climbs on supply cuts')).toBeDefined();
  expect(await screen.findByText(/₹9,98,663 free/)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: /XAUUSD/ }));
  await screen.findByText('terminal');
  expect(router.state.location.search).toMatchObject({ symbol: 'OANDA:XAUUSD' });
});

it('writes What to watch on request, shows the reason and the track record, and follows an item as a task', async () => {
  await renderHome();
  fireEvent.click(await screen.findByRole('button', { name: 'Write it now' }));
  expect(await screen.findByText('Reliance may follow crude higher')).toBeDefined();
  expect(screen.getByText(/Crude is up 1.2%/)).toBeDefined();
  expect(screen.getByText('Track record: right 3 of the last 5')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: /Watch RELIANCE above 1,350/ }));
  expect(await screen.findByText(/Watching RELIANCE above 1,350/)).toBeDefined();
  expect(briefs).toBe(1);
  expect(follows).toBe(1);
});

it('shows the greeting, IST market status and quick actions', async () => {
  await renderHome();
  const status = screen.getByRole('status', { name: 'Market status' });
  expect(status.textContent).toMatch(/NSE (open|closed)/);
  expect(status.textContent).toMatch(/US (open|closed|extended hours)/);
  expect(screen.getByRole('button', { name: 'Open terminal' })).toBeDefined();
  expect(screen.getByRole('button', { name: 'Ask the assistant' })).toBeDefined();
});
