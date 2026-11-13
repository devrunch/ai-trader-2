import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Providers } from '../../app/providers';
import { StrategiesPage } from './index';

vi.mock('./equity-chart', () => ({ EquityChart: ({ points }: { points: unknown[] }) => <div data-testid="equity-chart">{points.length} points</div> }));

const ID = '00000000-0000-4000-8000-0000000000a1';
const spec = { symbol: 'NSE:INFY', interval: '5', bars: 2000, indicators: [{ name: 'ema20', indicatorId: 'ema', inputs: { length: 20 } }],
  strategy: { side: 'long', entry: { kind: 'compare', left: { kind: 'series', name: 'close' }, op: 'crossesAbove', right: { kind: 'series', name: 'ema20' } } },
  costs: { commissionPct: 0.03, slippagePct: 0.02 } };
const strategy = { id: ID, name: 'EMA cross', spec, variants: 3, createdAt: '2026-11-11T00:00:00.000Z', updatedAt: '2026-11-11T00:00:00.000Z' };
const metrics = { totalReturnPct: 12.5, maxDrawdownPct: -4.2, tradeCount: 8, profitFactor: 1.8, sharpe: 1.1, exposurePct: 35, cagrPct: null, winRatePct: 60 };
const trade = (i: number) => ({ entryTime: 1_700_000_000_000 + i * 300_000, entryPrice: 100, exitTime: 1_700_000_150_000 + i * 300_000, exitPrice: 101, pnl: 1, returnPct: 1, barsHeld: 2, exitReason: 'target', side: 'long' });
const result = { sample: { symbol: 'NSE:INFY', interval: '5', bars: 2000, from: 'a', to: 'b' }, costs: { commissionPct: 0.03, slippagePct: 0.02 }, metrics,
  inSample: { startTime: 1, endTime: 2, metrics }, outOfSample: null, signals: { entries: 8, exits: 8 },
  trades: Array.from({ length: 120 }, (_, i) => trade(i)), equity: [{ time: 1, equity: 100 }, { time: 2, equity: 101 }] };

let items: unknown[] = [];
let runStatus = 200;
const runs: Array<Record<string, unknown>> = [];
const server = setupServer(
  http.get('/api/v1/strategies', () => HttpResponse.json({ items })),
  http.post('/api/v1/strategies/run', async ({ request }) => {
    const body = await request.json();
    if (typeof body === 'object' && body !== null) runs.push({ ...body });
    if (runStatus !== 200) return HttpResponse.json({ code: 'UNAVAILABLE', message: 'Backtesting is unavailable right now', requestId: 'r' }, { status: runStatus });
    return HttpResponse.json({ result, variants: 3 });
  }),
);
beforeAll(() => { server.listen(); });
beforeEach(() => { items = [strategy]; runStatus = 200; runs.length = 0; });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); });

it('lists saved strategies with their variant count', async () => {
  render(<Providers><StrategiesPage /></Providers>);
  expect(await screen.findByText('EMA cross')).toBeDefined();
  expect(screen.getByText('NSE:INFY · 5 · 3 variants tried')).toBeDefined();
});

it('says why the list is empty', async () => {
  items = [];
  render(<Providers><StrategiesPage /></Providers>);
  expect(await screen.findByText(/No saved strategies yet/)).toBeDefined();
});

it('loads a template into the rules', async () => {
  items = [];
  render(<Providers><StrategiesPage /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: /RSI dip buy/ }));
  expect((screen.getByDisplayValue('RSI dip buy') as HTMLInputElement).value).toBe('RSI dip buy');
});

it('runs a saved strategy with its id and shows metrics, the overfit note, a missing out-of-sample and 100 newest trades', async () => {
  render(<Providers><StrategiesPage /></Providers>);
  fireEvent.click(await screen.findByText('EMA cross'));
  fireEvent.click(screen.getByRole('button', { name: 'Run' }));
  expect(await screen.findByText('3 variants tried', { selector: 'span' })).toBeDefined();
  expect(screen.getByText('More variants tried means a higher risk the result is overfit; judge by out-of-sample.')).toBeDefined();
  expect(screen.getByRole('region', { name: 'Whole sample' }).textContent).toContain('12.50%');
  expect(screen.getByRole('region', { name: 'Out-of-sample' }).textContent).toContain('Not available');
  expect(screen.getByTestId('equity-chart').textContent).toBe('2 points');
  expect(screen.getAllByRole('row')).toHaveLength(101);
  expect(runs[0]).toMatchObject({ strategyId: ID, spec });
});

it('runs an unsaved strategy without a strategyId', async () => {
  render(<Providers><StrategiesPage /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: 'Run' }));
  await waitFor(() => { expect(runs).toHaveLength(1); });
  expect(runs[0]).not.toHaveProperty('strategyId');
  expect((runs[0]?.spec as { symbol: string }).symbol).toBe('NSE:NIFTY');
});

it('shows the server message when backtesting is unavailable', async () => {
  runStatus = 503;
  render(<Providers><StrategiesPage /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: 'Run' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Backtesting is unavailable right now');
});

it('refuses to run an invalid form and says why', async () => {
  render(<Providers><StrategiesPage /></Providers>);
  fireEvent.change(await screen.findByLabelText('Symbol'), { target: { value: 'nifty' } });
  fireEvent.click(screen.getByRole('button', { name: 'Run' }));
  expect((await screen.findByRole('alert')).textContent).toContain('symbol');
  expect(runs).toHaveLength(0);
});
