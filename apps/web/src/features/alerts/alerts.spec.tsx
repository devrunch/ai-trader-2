import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Providers } from '../../app/providers';
import { AlertsPanel } from './index';

const task = (patch: Record<string, unknown>) => ({ id: '00000000-0000-4000-8000-000000000001', threadId: null, mode: 'notify', title: 'NSE:INFY above 1,500',
  instruction: '', trigger: { kind: 'price', symbol: 'NSE:INFY', op: 'above', value: 1500 }, state: 'active', runs: 0, maxRuns: 1, lastRunAt: null,
  nextRunAt: null, lastError: null, lastOutcome: null, autoTrade: null, desk: null, expiresAt: '2026-12-11T00:00:00.000Z', createdAt: '2026-11-11T00:00:00.000Z', ...patch });
let tasks: Array<ReturnType<typeof task>> = [];
const posted: unknown[] = [];
const verbs: string[] = [];
const plotDef = (id: string, title: string) => ({ id, title, kind: 'line', color: 'blue', lineWidth: 1 });
const definition = (id: string, shortName: string, plots: unknown[]) => ({ ref: `builtin:${id}@1`, id, version: 1, name: shortName, shortName, overlay: false,
  inputs: [], plots, levels: [] });
const server = setupServer(
  http.get('/api/v1/indicators', () => HttpResponse.json({ indicators: [definition('rsi', 'RSI', [plotDef('rsi', 'RSI')]),
    definition('macd', 'MACD', [plotDef('macd', 'MACD'), plotDef('signal', 'Signal'), plotDef('hist', 'Histogram')])] })),
  http.get('/api/v1/agent/tasks', () => HttpResponse.json(tasks)),
  http.post('/api/v1/agent/tasks/alerts', async ({ request }) => {
    const body = await request.json(); posted.push(body);
    const created = task({ id: '00000000-0000-4000-8000-000000000002', title: 'NSE:RELIANCE below 1,300', trigger: { kind: 'price', symbol: 'NSE:RELIANCE', op: 'below', value: 1300 } });
    tasks = [...tasks, created];
    return HttpResponse.json({ ...created, conditionNow: 1331.2 }, { status: 201 });
  }),
  http.post('/api/v1/agent/tasks/:id/:verb', ({ params }) => { verbs.push(String(params.verb)); return HttpResponse.json(task({ state: 'cancelled' })); }),
);
beforeAll(() => { server.listen(); });
beforeEach(() => { posted.length = 0; verbs.length = 0; tasks = [
  task({}),
  task({ id: '00000000-0000-4000-8000-000000000003', mode: 'agent', threadId: '00000000-0000-4000-8000-0000000000b1', title: 'Assistant task' }),
]; });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); });

it('lists alerts only, not the assistant\'s tasks, and opens the alert\'s symbol', async () => {
  const open = vi.fn();
  render(<Providers><AlertsPanel symbol="NSE:RELIANCE" interval="5" onOpenSymbol={open} /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: 'NSE:INFY above 1,500' }));
  expect(open).toHaveBeenCalledWith('NSE:INFY');
  expect(screen.queryByText('Assistant task')).toBeNull();
});

it('creates a price alert on the chart symbol and shows the last price', async () => {
  render(<Providers><AlertsPanel symbol="NSE:RELIANCE" interval="5" onOpenSymbol={vi.fn()} /></Providers>);
  await screen.findByText('NSE:INFY above 1,500');
  fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'below' } });
  fireEvent.change(screen.getByLabelText('Level'), { target: { value: '1300' } });
  fireEvent.click(screen.getByLabelText('Every crossing (30 days)'));
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByText('Saved. Last price 1331.2.')).toBeDefined();
  expect(posted).toEqual([{ trigger: { kind: 'price', symbol: 'NSE:RELIANCE', op: 'below', value: 1300 }, repeat: true }]);
  expect(await screen.findByText('NSE:RELIANCE below 1,300')).toBeDefined();
});

it('refuses an empty or non-positive level, and deletes an alert', async () => {
  render(<Providers><AlertsPanel symbol="NSE:RELIANCE" interval="5" onOpenSymbol={vi.fn()} /></Providers>);
  await screen.findByText('NSE:INFY above 1,500');
  fireEvent.change(screen.getByLabelText('Level'), { target: { value: '-5' } });
  expect(screen.getByRole('button', { name: 'Add' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Delete alert NSE:INFY above 1,500' }));
  await waitFor(() => { expect(verbs).toEqual(['cancel']); });
});

it('sets an indicator alert on the chart interval, with the chosen plot, and allows a negative level', async () => {
  render(<Providers><AlertsPanel symbol="NSE:RELIANCE" interval="5" onOpenSymbol={vi.fn()} /></Providers>);
  await screen.findByText('NSE:INFY above 1,500');
  await screen.findByRole('option', { name: 'MACD (5)' });
  fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'macd' } });
  fireEvent.change(screen.getByLabelText('Plot'), { target: { value: 'signal' } });
  fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'below' } });
  fireEvent.change(screen.getByLabelText('Level'), { target: { value: '-2.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() => { expect(posted).toEqual([{ trigger: { kind: 'indicator', symbol: 'NSE:RELIANCE', interval: '5', indicatorId: 'macd', inputs: {}, plot: 'signal',
    op: 'below', value: -2.5 }, repeat: false }]); });
});

it('creates a news alert from market, keyword and impact', async () => {
  render(<Providers><AlertsPanel symbol="NSE:RELIANCE" interval="5" onOpenSymbol={vi.fn()} /></Providers>);
  await screen.findByText('NSE:INFY above 1,500');
  fireEvent.change(screen.getByLabelText('Alert type'), { target: { value: 'news' } });
  fireEvent.change(screen.getByLabelText('Market'), { target: { value: 'india' } });
  fireEvent.change(screen.getByLabelText('Keywords'), { target: { value: 'rbi' } });
  fireEvent.change(screen.getByLabelText('Minimum impact'), { target: { value: 'high' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() => { expect(posted).toEqual([{ trigger: { kind: 'news', markets: ['india'], symbols: [], keywords: ['rbi'], minImpact: 'high' }, repeat: true }]); });
});

it('creates an event alert from country codes, defaulting to High and 5 minutes', async () => {
  render(<Providers><AlertsPanel symbol="NSE:RELIANCE" interval="5" onOpenSymbol={vi.fn()} /></Providers>);
  await screen.findByText('NSE:INFY above 1,500');
  fireEvent.change(screen.getByLabelText('Alert type'), { target: { value: 'event' } });
  fireEvent.change(screen.getByLabelText('Countries'), { target: { value: 'usd, eur' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() => { expect(posted).toEqual([{ trigger: { kind: 'event', countries: ['USD', 'EUR'], minImpact: 'High', afterMinutes: 5 }, repeat: true }]); });
});

it('disables Add for an invalid country code, and does not open a symbol for a news alert row', async () => {
  const open = vi.fn();
  tasks = [task({ title: 'India headlines', trigger: { kind: 'news', markets: ['india'], symbols: [], keywords: [], minImpact: 'medium' }, lastOutcome: 'silent' })];
  render(<Providers><AlertsPanel symbol="NSE:RELIANCE" interval="5" onOpenSymbol={open} /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: 'India headlines' }));
  expect(open).not.toHaveBeenCalled();
  expect(screen.getByText(/last outcome: silent/)).toBeDefined();
  fireEvent.change(screen.getByLabelText('Alert type'), { target: { value: 'event' } });
  fireEvent.change(screen.getByLabelText('Countries'), { target: { value: 'us' } });
  expect(screen.getByRole('button', { name: 'Add' }).hasAttribute('disabled')).toBe(true);
});
