import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { Providers } from '../../app/providers';
import { HomePage } from './index';

const quote = (id: string, price: number, changePct: number) => ({ instrumentId: id, resolvedId: id, price, change: 1, changePct, at: 1, status: { state: 'ok' } });
let briefs = 0;
const server = setupServer(
  http.get('/api/v1/watchlist', () => HttpResponse.json({ items: ['NSE:NIFTY', 'OANDA:XAUUSD'], custom: true })),
  http.get('/api/v1/quotes', () => HttpResponse.json({ quotes: [quote('NSE:NIFTY', 25255.05, 0.84), quote('OANDA:XAUUSD', 4012.5, -0.31)] })),
  http.get('/api/v1/calendar', () => HttpResponse.json({ events: [{ id: 'e1', title: 'CPI m/m', country: 'USD', at: '2026-11-12T13:30:00.000Z', impact: 'High',
    forecast: '0.3%', previous: '0.4%', moves: ['US stocks', 'Gold', 'USD/INR'] }] })),
  http.get('/api/v1/news', () => HttpResponse.json({ items: [{ id: 'n1', source: 'Reuters', title: 'Oil climbs on supply cuts', url: 'https://example.com/a',
    summary: null, publishedAt: new Date().toISOString(), symbols: ['MCX:CRUDEOIL1!'] }] })),
  http.get('/api/v1/paper/accounts', () => HttpResponse.json({ accounts: [
    { id: 'a', currency: 'INR', initialCash: 1e6, cash: 1e6, usedMargin: 0, available: 998_663, realisedPnl: -52, charges: 3 }] })),
  http.get('/api/v1/agent/tasks', () => HttpResponse.json([])),
  http.post('/api/v1/agent/brief', () => { briefs++; return HttpResponse.json({ threadId: 't1', text: '- NIFTY held 25,200\n- **Bias:** up above 25,300', error: null }); }),
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
  expect(await screen.findByText('25,255.05')).toBeDefined();
  expect(screen.getByText('CPI m/m')).toBeDefined();
  expect(await screen.findByText('Moves: US stocks, Gold, USD/INR')).toBeDefined();
  expect(await screen.findByText('Oil climbs on supply cuts')).toBeDefined();
  expect(await screen.findByText(/₹9,98,663 free/)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: /XAUUSD/ }));
  await screen.findByText('terminal');
  expect(router.state.location.search).toMatchObject({ symbol: 'OANDA:XAUUSD' });
});

it('writes the pre-market brief on request', async () => {
  await renderHome();
  fireEvent.click(await screen.findByRole('button', { name: 'Write today’s brief' }));
  expect(await screen.findByText(/NIFTY held 25,200/)).toBeDefined();
  expect(briefs).toBe(1);
});
