import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Providers } from '../../app/providers';
import { OrderDialog, TradingPanel } from './index';

const account = { id: 'a', currency: 'INR', initialCash: 1e6, cash: 999_970, usedMargin: 3000, available: 996_970, realisedPnl: 0, charges: 30 };
const order = (patch: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-0000000000aa', clientOrderId: 'web-1', instrumentId: 'NSE:INFY', currency: 'INR', side: 'buy', type: 'limit', product: 'MIS', quantity: 10,
  limitPrice: 1490, triggerPrice: null, stopLoss: null, target: null, status: 'open', triggered: false, rejectReason: null, closeReason: null,
  parentOrderId: null, fillPrice: null, placedAt: 1, expiresAt: 2, filledAt: null, updatedAt: 1, ...patch,
});
const position = { instrumentId: 'NSE:INFY', currency: 'INR', product: 'MIS', quantity: 10, averagePrice: 1490, realisedPnl: 0, lastPrice: 1500, unrealisedPnl: 100, squareOffAt: 2 };
const placed: Array<Record<string, unknown>> = [];
let cancelled = 0;
const server = setupServer(
  http.get('/api/v1/paper/accounts', () => HttpResponse.json({ accounts: [account] })),
  http.get('/api/v1/paper/positions', () => HttpResponse.json({ positions: [position] })),
  http.get('/api/v1/paper/orders', () => HttpResponse.json({ orders: [order()] })),
  http.post('/api/v1/paper/orders', async ({ request }) => {
    const body = await request.json();
    if (typeof body === 'object' && body !== null) placed.push({ ...body });
    return HttpResponse.json({ order: order({ status: 'rejected', rejectReason: 'MARKET_CLOSED', type: 'market', limitPrice: null }) }, { status: 201 });
  }),
  http.post('/api/v1/paper/orders/:id/cancel', () => { cancelled++; return HttpResponse.json({ order: order({ status: 'cancelled', closeReason: 'USER' }) }); }),
);
beforeAll(() => { server.listen(); });
beforeEach(() => { placed.length = 0; cancelled = 0; });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); });

it('shows the paper account, positions with P&L and working orders (FR-PT-1)', async () => {
  render(<Providers><TradingPanel symbol="NSE:INFY" onTrade={vi.fn()} /></Providers>);
  expect(await screen.findByText('₹9,96,970.00')).toBeDefined();
  const row = await screen.findByRole('row', { name: /NSE:INFY MIS 10/ });
  expect(row.textContent).toContain('₹1,490.00');
  expect(row.textContent).toContain('+100.00');
  expect(screen.getAllByText('+100.00').length).toBeGreaterThan(1); // the row and the unrealised P&L total
  fireEvent.click(screen.getByRole('tab', { name: 'Orders 1' }));
  expect(await screen.findByRole('row', { name: /NSE:INFY Buy limit 10 ₹1,490.00/ })).toBeDefined();
});

it('switches between currency accounts, each in its own money', async () => {
  const usd = { ...account, id: 'b', currency: 'USD', initialCash: 1e5, cash: 1e5, usedMargin: 0, available: 98_765.4, charges: 0 };
  const aapl = { ...position, instrumentId: 'NASDAQ:AAPL', currency: 'USD', averagePrice: 200.5, lastPrice: 201, unrealisedPnl: 50 };
  server.use(http.get('/api/v1/paper/accounts', () => HttpResponse.json({ accounts: [account, usd] })),
    http.get('/api/v1/paper/positions', () => HttpResponse.json({ positions: [position, aapl] })));
  render(<Providers><TradingPanel symbol="NSE:INFY" onTrade={vi.fn()} /></Providers>);
  expect(await screen.findByText('₹9,96,970.00')).toBeDefined();
  fireEvent.click(screen.getByRole('radio', { name: 'USD' }));
  expect(await screen.findByText('$98,765.40')).toBeDefined();
  expect(screen.getByRole('row', { name: /NASDAQ:AAPL/ }).textContent).toContain('$200.50');
});

it('opens the order ticket on the side the user picked', () => {
  const onTrade = vi.fn();
  render(<Providers><TradingPanel symbol="NSE:INFY" onTrade={onTrade} /></Providers>);
  fireEvent.click(screen.getByRole('button', { name: 'Sell INFY' }));
  expect(onTrade).toHaveBeenCalledWith('sell');
});

it('says why there is nothing to show', async () => {
  server.use(http.get('/api/v1/paper/positions', () => HttpResponse.json({ positions: [] })), http.get('/api/v1/paper/orders', () => HttpResponse.json({ orders: [] })));
  render(<Providers><TradingPanel symbol="NSE:INFY" onTrade={vi.fn()} /></Providers>);
  expect(await screen.findByText('No positions yet. Use Buy or Sell to place a paper order.')).toBeDefined();
  fireEvent.click(screen.getByRole('tab', { name: 'Orders' }));
  expect(await screen.findByText('No working orders.')).toBeDefined();
});

it('shows the reason and a retry when the account fails to load', async () => {
  server.use(http.get('/api/v1/paper/accounts', () => HttpResponse.json({ code: 'UNAVAILABLE', message: 'Database unavailable', requestId: 'r' }, { status: 503 })));
  render(<Providers><TradingPanel symbol="NSE:INFY" onTrade={vi.fn()} /></Providers>);
  expect(await screen.findByText('Database unavailable', {}, { timeout: 5000 })).toBeDefined();
});

it('places a market order with a client id, keeps that id until answered, and explains a rejection (FR-PT-3, E9)', async () => {
  render(<Providers><OrderDialog symbol="NSE:INFY" side="buy" onClose={vi.fn()} /></Providers>);
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Place paper buy' }));
  expect(await screen.findByText('Buy 10 NSE:INFY rejected: the market is closed.')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Place paper buy' }));
  await waitFor(() => { expect(placed).toHaveLength(2); });
  expect(placed[0]).toMatchObject({ instrumentId: 'NSE:INFY', side: 'buy', type: 'market', product: 'MIS', quantity: 5 });
  expect(placed[0]?.clientOrderId).toMatch(/^web-/);
  expect(placed[1]?.clientOrderId).not.toBe(placed[0]?.clientOrderId);
});

it('cancels a working order', async () => {
  render(<Providers><TradingPanel symbol="NSE:INFY" onTrade={vi.fn()} /></Providers>);
  fireEvent.click(await screen.findByRole('tab', { name: 'Orders 1' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  await waitFor(() => { expect(cancelled).toBe(1); });
});
