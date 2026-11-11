import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { Providers } from '../../app/providers';
import { NewsPanel } from './index';

const item = (id: string, title: string, symbols: string[]) => ({ id, source: 'Livemint', title, url: `https://mint.test/${id}`, summary: 'Benchmarks rose.',
  publishedAt: new Date(Date.now() - 30 * 60_000).toISOString(), symbols });
const asked: string[] = [];
const server = setupServer(http.get('/api/v1/news', ({ request }) => {
  const symbol = new URL(request.url).searchParams.get('symbol');
  asked.push(symbol ?? 'all');
  return HttpResponse.json({ items: symbol ? [item('b', 'Reliance jumps', ['NSE:RELIANCE'])] : [item('a', 'Nifty at record', ['NSE:NIFTY']), item('b', 'Reliance jumps', ['NSE:RELIANCE'])] });
}));
beforeAll(() => { server.listen(); });
afterEach(() => { cleanup(); server.resetHandlers(); asked.length = 0; });
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
