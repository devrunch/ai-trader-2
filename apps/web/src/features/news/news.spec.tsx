import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { Providers } from '../../app/providers';
import { NewsPanel } from './index';

type Extra = { impact?: 'high' | 'medium' | 'low'; moves?: string[]; direction?: 'up' | 'down' | 'unclear' | null };
const item = (id: string, title: string, symbols: string[], extra: Extra = {}) => ({ id, source: 'Livemint', title, url: `https://mint.test/${id}`, summary: 'Benchmarks rose.',
  publishedAt: new Date(Date.now() - 30 * 60_000).toISOString(), symbols, impact: 'low', moves: [], direction: null, ...extra });
const asked: string[] = [];
const impactAsked: (string | null)[] = [];
const server = setupServer(http.get('/api/v1/news', ({ request }) => {
  const params = new URL(request.url).searchParams;
  const symbol = params.get('symbol');
  const minImpact = params.get('minImpact');
  impactAsked.push(minImpact);
  if (minImpact) return HttpResponse.json({ items: [item('h', 'RBI hikes rates', [], { impact: 'high' })] });
  asked.push(symbol ?? 'all');
  const nifty = item('a', 'Nifty at record', ['NSE:NIFTY'], { impact: 'high', moves: ['NSE:NIFTY', 'NSE:BANKNIFTY', 'US stocks'], direction: 'up' });
  return HttpResponse.json({ items: symbol ? [item('b', 'Reliance jumps', ['NSE:RELIANCE'])] : [nifty, item('b', 'Reliance jumps', ['NSE:RELIANCE'])] });
}));
beforeAll(() => { server.listen(); });
afterEach(() => { cleanup(); server.resetHandlers(); asked.length = 0; impactAsked.length = 0; });
afterAll(() => { server.close(); });

it('shows headlines with source, age and instruments; filters to the chart symbol; opens a tagged symbol', async () => {
  const onOpenSymbol = vi.fn();
  render(<Providers><NewsPanel symbol="NSE:RELIANCE" onOpenSymbol={onOpenSymbol} /></Providers>);
  expect((await screen.findByRole('link', { name: 'Nifty at record' })).getAttribute('target')).toBe('_blank');
  expect(screen.getAllByText('30m')).toHaveLength(2);
  fireEvent.click(screen.getByRole('tab', { name: 'RELIANCE' }));
  await vi.waitFor(() => { expect(asked).toEqual(['all', 'NSE:RELIANCE']); });
  expect(await screen.findByRole('link', { name: 'Reliance jumps' })).toBeDefined();
  expect(screen.queryByRole('link', { name: 'Nifty at record' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'RELIANCE' }));
  expect(onOpenSymbol).toHaveBeenCalledWith('NSE:RELIANCE');
});

it('shows an impact dot with an accessible label, the moves line and its direction; hides the line when moves is empty', async () => {
  render(<Providers><NewsPanel symbol="NSE:RELIANCE" onOpenSymbol={vi.fn()} /></Providers>);
  await screen.findByRole('link', { name: 'Nifty at record' });
  expect(screen.getByLabelText('High impact').getAttribute('title')).toBe('High impact');
  expect(screen.getByLabelText('Low impact')).toBeDefined();
  expect(screen.getByText('Moves: NIFTY, BANKNIFTY, US stocks')).toBeDefined();
  expect(screen.getByLabelText('likely up').textContent).toBe('▲');
  expect(screen.getAllByText(/^Moves:/)).toHaveLength(1);
  expect(screen.queryByLabelText('likely down')).toBeNull();
});

it('requests minImpact=high when High only is pressed', async () => {
  render(<Providers><NewsPanel symbol="NSE:RELIANCE" onOpenSymbol={vi.fn()} /></Providers>);
  await screen.findByRole('link', { name: 'Nifty at record' });
  const toggle = screen.getByRole('button', { name: 'High only' });
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(toggle);
  expect(await screen.findByRole('link', { name: 'RBI hikes rates' })).toBeDefined();
  expect(impactAsked).toContain('high');
  expect(screen.getByRole('button', { name: 'High only' }).getAttribute('aria-pressed')).toBe('true');
});
