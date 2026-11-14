import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import type { OptionChain, OptionsSummary } from '@aitrader/contracts';
import { Providers } from '../../app/providers';
import { OptionsPanel } from './index';

const leg = (oi: number, oiChange: number) => ({ symbol: 'X', ltp: 10.5, oi, oiChange, volume: 1, iv: 14.25 });
const chain: OptionChain = { underlying: 'NIFTY', expiry: '2026-11-19', expiries: ['2026-11-19', '2026-11-26'], spot: 24010, atm: 24000, source: 'kite', fetchedAt: '2026-11-14T10:00:00Z',
  rows: [{ strike: 23900, ce: leg(1000, 50), pe: leg(500, -20) }, { strike: 24000, ce: leg(2000, 100), pe: leg(4000, 300) }] };
const summary: OptionsSummary = { underlying: 'NIFTY', expiry: '2026-11-19', pcr: 1.25, maxPain: 24000, totalCeOi: 3000, totalPeOi: 4500, source: 'kite', fetchedAt: '2026-11-14T10:00:00Z',
  buildups: [{ strike: 24000, type: 'PE', oi: 4000, oiChange: 300 }] };
let chainResponse = () => HttpResponse.json(chain);
const server = setupServer(http.get('/api/v1/options/:u/chain', () => chainResponse()), http.get('/api/v1/options/:u/summary', () => HttpResponse.json(summary)));
beforeAll(() => { server.listen(); });
afterEach(() => { cleanup(); server.resetHandlers(); chainResponse = () => HttpResponse.json(chain); });
afterAll(() => { server.close(); });
const show = (symbol = 'NSE:NIFTY') => render(<Providers><OptionsPanel symbol={symbol} /></Providers>);

// FR-OPT option chain panel
it('renders chain rows with the at-the-money strike highlighted and OI bars', async () => {
  show();
  const rows = await screen.findAllByRole('row');
  const atm = rows.find(r => r.getAttribute('data-atm') === 'true');
  expect(within(atm as HTMLElement).getByText('24000')).toBeDefined();
  expect(rows.filter(r => r.getAttribute('data-atm') === 'false')).toHaveLength(1);
  expect(screen.getAllByTestId('oi-bar').map(b => b.style.width)).toEqual(['25%', '13%', '50%', '100%']);
});
it('shows PCR, max pain, total OI and build-ups', async () => {
  show();
  expect(await screen.findByText('1.25')).toBeDefined();
  expect(screen.getByText('Max pain').nextSibling?.textContent).toBe('24000');
  expect(screen.getByText('3,000')).toBeDefined(); expect(screen.getByText('4,500')).toBeDefined();
  expect(within(screen.getByRole('list', { name: 'Build-ups' })).getByText('24000 PE')).toBeDefined();
});
it('says there are no options on a 404', async () => {
  chainResponse = () => HttpResponse.json({ code: 'NOT_FOUND', message: 'x', requestId: 'r' }, { status: 404 });
  show('NSE:TCS');
  expect(await screen.findByText('No options for this symbol')).toBeDefined();
});
it('says there are no options for a non-NSE symbol without fetching', () => {
  show('DERIV:R_100');
  expect(screen.getByText('No options for this symbol')).toBeDefined();
});
it('shows why on error and reloads on retry', async () => {
  chainResponse = () => HttpResponse.json({ code: 'UNAVAILABLE', message: 'down', requestId: 'r' }, { status: 503 });
  show();
  const retry = await screen.findByRole('button', { name: 'Retry' });
  expect(screen.getByText(/Could not load the option chain/)).toBeDefined();
  chainResponse = () => HttpResponse.json(chain);
  fireEvent.click(retry);
  expect(await screen.findByLabelText('Expiry')).toBeDefined();
});
