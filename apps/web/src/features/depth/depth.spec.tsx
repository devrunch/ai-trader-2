import { act, cleanup, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { Depth, DepthResponse } from '@aitrader/contracts';
import { Providers } from '../../app/providers';
import { DepthPanel } from './index';

const live = vi.hoisted(() => ({ handler: undefined as ((r: DepthResponse) => void) | undefined, off: vi.fn() }));
vi.mock('../../shared/live', () => ({ liveClient: () => ({ watchDepth: (_s: string, h: (r: DepthResponse) => void) => { live.handler = h; return live.off; } }) }));

// FR-MD-2 order book panel
const level = (price: number, quantity: number, orders: number | null) => ({ price, quantity, orders });
const book = (extra: Partial<Depth> = {}): Depth => ({ instrumentId: 'NSE:TEST', at: Date.now(), source: 'kite', levels: '5',
  bids: [level(99.5, 300, 4), level(99.4, 100, 2)], asks: [level(100.5, 100, 1), level(100.6, 100, 3)],
  spread: 1, spreadPct: 1, totalBidQty: 400, totalAskQty: 200, imbalance: 0.33, ...extra });
let body: DepthResponse = { depth: book(), unavailable: null };
const server = setupServer(http.get('/api/v1/depth/:id', () => HttpResponse.json(body)));
beforeAll(() => { server.listen(); });
afterEach(() => { cleanup(); server.resetHandlers(); live.handler = undefined; vi.useRealTimers(); });
afterAll(() => { server.close(); });
const show = () => render(<Providers><DepthPanel symbol="NSE:TEST" /></Providers>);

it('renders both sides with price, quantity and orders, the spread and the imbalance', async () => {
  body = { depth: book(), unavailable: null }; show();
  const bids = within(await screen.findByRole('list', { name: 'Bids' }));
  expect(bids.getAllByRole('listitem')[0]?.textContent).toBe('99.503004');
  expect(within(screen.getByRole('list', { name: 'Asks' })).getAllByRole('listitem').map(i => i.textContent)).toEqual(['100.601003', '100.501001']);
  expect(screen.getByText('Spread 1.00 (1.000%)')).toBeDefined();
  expect(screen.getByText('Buy 400')).toBeDefined(); expect(screen.getByText('Sell 200')).toBeDefined();
  expect(screen.getByText('Imbalance +0.33 (buyers)')).toBeDefined();
  expect(screen.getAllByTestId('depth-bar').map(b => b.style.width)).toEqual(['33%', '33%', '100%', '33%']);
});
it('replaces the book when a live push arrives', async () => {
  body = { depth: book(), unavailable: null }; show();
  await screen.findByRole('list', { name: 'Bids' });
  act(() => { live.handler?.({ depth: book({ bids: [level(98, 50, 1)], spread: 2.5, totalBidQty: 50 }), unavailable: null }); });
  expect(await screen.findByText('Spread 2.50 (1.000%)')).toBeDefined();
  expect(within(screen.getByRole('list', { name: 'Bids' })).getAllByRole('listitem')).toHaveLength(1);
});
it('shows only prices for a top-of-book instrument', async () => {
  body = { depth: book({ levels: '1', bids: [level(1.0999, 0, null)], asks: [level(1.1001, 0, null)], imbalance: null, totalBidQty: 0, totalAskQty: 0 }), unavailable: null }; show();
  expect(await screen.findByText('Imbalance unavailable (no quantities)')).toBeDefined();
  expect(screen.queryByTestId('depth-bar')).toBeNull();
});
it('marks an old book as stale', async () => {
  body = { depth: book({ at: Date.now() - 30_000 }), unavailable: null }; show();
  expect((await screen.findByRole('status')).textContent).toMatch(/^Stale: last update 3\d s ago$/);
});
it.each([['Market closed', 'Market closed'], ['No order book for this instrument', 'No order book for this instrument'], ['Not subscribed yet', 'Waiting for depth']])(
  'says why there is no book: %s', async (unavailable, text) => {
    body = { depth: null, unavailable }; show();
    expect(await screen.findByText(text)).toBeDefined();
  });
it('offers a retry when the request fails', async () => {
  server.use(http.get('/api/v1/depth/:id', () => HttpResponse.json({ code: 'UNAVAILABLE', message: 'x', requestId: 'r' }, { status: 503 })));
  show();
  expect(await screen.findByRole('button', { name: 'Retry' }, { timeout: 5000 })).toBeDefined();
});
