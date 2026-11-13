import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Providers } from '../../app/providers';
import { ScreenerPage } from './index';

const ID = '00000000-0000-4000-8000-0000000000b1';
const universes = [{ id: 'nifty50', name: 'Nifty 50', count: 50, note: null }, { id: 'nifty500', name: 'Nifty 500', count: 500, note: 'Stocks only; indices excluded.' }];
const presets = [{ id: 'oversold-rsi', name: 'Oversold RSI', description: 'RSI(14) below 30 on a volume spike.' }];
const saved = { id: ID, name: 'Mine', spec: { universe: 'nifty50', interval: '1D', preset: 'oversold-rsi', indicators: [], fundamentals: [], limit: 50 }, createdAt: '2026-11-11T00:00:00.000Z', updatedAt: '2026-11-11T00:00:00.000Z' };
const result = { universe: 'nifty50', interval: '1D', preset: 'oversold-rsi', asOfBar: Date.UTC(2026, 10, 11, 10, 0), scanned: 50, matched: 1,
  rows: [{ symbol: 'NSE:INFY', name: 'Infosys', last: 1500.5, changePct: -2.5, barTime: Date.UTC(2026, 10, 11, 10, 0), values: { rsi: 24.1, volumeRatio: 3.2 }, spark: [3, 2, 1] }],
  stale: [{ symbol: 'NSE:TCS', reason: 'no bars in 3 days' }], durationMs: 12, cached: true };

let items: unknown[] = [];
let scanStatus = 200;
let scanBody: typeof result = result;
const scans: Array<Record<string, unknown>> = [];
const creates: Array<Record<string, unknown>> = [];
let createStatus = 200;
const server = setupServer(
  http.get('/api/v1/screener/universes', () => HttpResponse.json({ items: universes })),
  http.get('/api/v1/screener/presets', () => HttpResponse.json({ items: presets })),
  http.get('/api/v1/screener/screens', () => HttpResponse.json({ items })),
  http.post('/api/v1/screener/scan', async ({ request }) => {
    const body = await request.json();
    if (typeof body === 'object' && body !== null) scans.push({ ...body });
    if (scanStatus !== 200) return HttpResponse.json({ code: 'VALIDATION_FAILED', message: 'unknown series "foo"', requestId: 'r' }, { status: scanStatus });
    return HttpResponse.json(scanBody);
  }),
  http.post('/api/v1/screener/screens', async ({ request }) => {
    const body = await request.json();
    if (typeof body === 'object' && body !== null) creates.push({ ...body });
    if (createStatus !== 200) return HttpResponse.json({ code: 'CONFLICT', message: 'You can save at most 30 screens', requestId: 'r' }, { status: createStatus });
    return HttpResponse.json(saved);
  }),
);
beforeAll(() => { server.listen(); });
beforeEach(() => { items = []; scanStatus = 200; createStatus = 200; scanBody = result; scans.length = 0; creates.length = 0; });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); });

const open = vi.fn();
const renderPage = () => render(<Providers><ScreenerPage onOpen={open} /></Providers>);
const run = () => { fireEvent.click(screen.getByRole('button', { name: 'Run' })); };

it('shows universe counts and the note', async () => {
  renderPage();
  expect(await screen.findByRole('option', { name: 'Nifty 500 (500)' })).toBeDefined();
  fireEvent.change(screen.getByLabelText('Universe'), { target: { value: 'nifty500' } });
  expect(screen.getByText('Stocks only; indices excluded.')).toBeDefined();
});

it('posts the preset spec and renders matches, header, matched values and the stale list', async () => {
  renderPage();
  await screen.findByRole('option', { name: 'Oversold RSI' });
  fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'oversold-rsi' } });
  expect(screen.getByText('RSI(14) below 30 on a volume spike.')).toBeDefined();
  run();
  expect(await screen.findByText('1 matched of 50 scanned on 1D bars as of 11 Nov close')).toBeDefined();
  expect(scans[0]).toEqual({ spec: { universe: 'nifty50', interval: '1D', preset: 'oversold-rsi', indicators: [], fundamentals: [], limit: 50 } });
  expect(screen.getByText('cached')).toBeDefined();
  expect(screen.getByText('rsi 24.1 volumeRatio 3.2')).toBeDefined();
  expect(screen.getByText('-2.50%').className).toContain('text-down');
  expect(screen.getByTestId('spark-NSE:INFY')).toBeDefined();
  fireEvent.click(screen.getByText('Not scanned (1)'));
  expect(screen.getByText('NSE:TCS - no bars in 3 days')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'NSE:INFY' }));
  expect(open).toHaveBeenCalledWith('NSE:INFY', '1D');
});

it('posts the conditions DSL with declared indicators', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('tab', { name: 'Conditions' }));
  fireEvent.click(screen.getByRole('button', { name: '+ RSI' }));
  fireEvent.change(screen.getByLabelText('Condition 1 left'), { target: { value: 'rsi14' } });
  fireEvent.change(screen.getByLabelText('Condition 1 operator'), { target: { value: 'lt' } });
  fireEvent.change(screen.getByLabelText('Condition 1 right'), { target: { value: '30' } });
  fireEvent.change(screen.getByLabelText('Interval'), { target: { value: '60' } });
  run();
  await waitFor(() => { expect(scans).toHaveLength(1); });
  expect(scans[0]).toEqual({ spec: { universe: 'nifty50', interval: '60', indicators: [{ name: 'rsi14', indicatorId: 'rsi', inputs: { length: 14 } }], fundamentals: [], limit: 50,
    condition: { kind: 'compare', left: { kind: 'series', name: 'rsi14' }, op: 'lt', right: { kind: 'value', value: 30 } } } });
});

it('posts fundamentals filters and shows the NSE hint', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('tab', { name: 'Fundamentals' }));
  expect(screen.getByText(/apply to NSE stocks/)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
  fireEvent.change(screen.getByLabelText('Filter 1 field'), { target: { value: 'roe' } });
  fireEvent.change(screen.getByLabelText('Filter 1 operator'), { target: { value: 'gte' } });
  fireEvent.change(screen.getByLabelText('Filter 1 value'), { target: { value: '15' } });
  run();
  await waitFor(() => { expect(scans).toHaveLength(1); });
  expect(scans[0]).toMatchObject({ spec: { fundamentals: [{ field: 'roe', op: 'gte', value: 15 }] } });
});

it('says what was scanned when nothing matches', async () => {
  scanBody = { ...result, matched: 0, rows: [], stale: [] };
  renderPage();
  await screen.findByRole('option', { name: 'Oversold RSI' });
  fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'oversold-rsi' } });
  run();
  expect(await screen.findByText('No matches: 50 symbols in nifty50 were scanned on 1D bars.')).toBeDefined();
});

it('shows the server message for a bad spec', async () => {
  scanStatus = 422;
  renderPage();
  await screen.findByRole('option', { name: 'Oversold RSI' });
  fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'oversold-rsi' } });
  run();
  expect((await screen.findByRole('alert')).textContent).toContain('unknown series "foo"');
});

it('does not run without a preset and says why', async () => {
  renderPage();
  await screen.findByRole('option', { name: 'Oversold RSI' });
  run();
  expect((await screen.findByRole('alert')).textContent).toBe('Pick a preset.');
  expect(scans).toHaveLength(0);
});

it('saves the screen with its name and shows the limit message on a conflict', async () => {
  renderPage();
  await screen.findByRole('option', { name: 'Oversold RSI' });
  fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'oversold-rsi' } });
  fireEvent.change(screen.getByLabelText('Screen name'), { target: { value: 'Mine' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save this screen' }));
  await waitFor(() => { expect(creates).toHaveLength(1); });
  expect(creates[0]).toEqual({ name: 'Mine', spec: { universe: 'nifty50', interval: '1D', preset: 'oversold-rsi', indicators: [], fundamentals: [], limit: 50 } });
  createStatus = 409;
  fireEvent.click(screen.getByRole('button', { name: 'Save this screen' }));
  expect((await screen.findByRole('alert')).textContent).toContain('You can save at most 30 screens');
});

it('lists saved screens and loads one into the form', async () => {
  items = [{ ...saved, spec: { ...saved.spec, universe: 'nifty500', interval: '60' } }];
  renderPage();
  const list = await screen.findByRole('complementary', { name: 'Saved screens' });
  fireEvent.click(await within(list).findByText('Mine'));
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Universe' }).value).toBe('nifty500');
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Interval' }).value).toBe('60');
});

it('says why the saved list is empty', async () => {
  renderPage();
  expect(await screen.findByText('No saved screens yet.')).toBeDefined();
});
