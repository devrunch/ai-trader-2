import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import type { IndicatorDefinition } from '@aitrader/contracts';
import { Providers } from '../../app/providers';
import { IndicatorLegend } from './indicator-legend';
import { specOf } from './indicator-spec';
import { useIndicatorStore } from './state/indicator-store';
import { useChartIndicators } from './use-chart-indicators';

const SOURCE = '//@version=5\nindicator("My band")';
const pine: IndicatorDefinition = {
  ref: 'pine:ab12cd34ef56@1', id: 'ab12cd34ef56', version: 1, name: 'My band indicator', shortName: 'My band', overlay: false, levels: [],
  inputs: [{ id: 'length', title: 'Length', type: 'int', default: 5, min: 1, max: 500 }],
  plots: [{ id: 'p0', title: 'Band', kind: 'line', color: 'blue', lineWidth: 1 }],
};
const sma: IndicatorDefinition = {
  ref: 'builtin:sma@1', id: 'sma', version: 1, name: 'Moving Average Simple', shortName: 'SMA', overlay: true, levels: [],
  inputs: [{ id: 'length', title: 'Length', type: 'int', default: 9, min: 1, max: 5000 }, { id: 'source', title: 'Source', type: 'source', default: 'close' }],
  plots: [{ id: 'ma', title: 'MA', kind: 'line', color: 'blue', lineWidth: 1 }],
};
const bodies: unknown[] = [];
let reason: string | undefined;
let failure = false;
const server = setupServer(
  http.get('/api/v1/indicators', () => HttpResponse.json({ indicators: [sma] })),
  http.post('/api/v1/indicators/compute', async ({ request }) => {
    bodies.push(await request.json());
    if (failure) return HttpResponse.json({ code: 'VALIDATION_FAILED', message: 'Script error: line 2', requestId: 'r1' }, { status: 422 });
    return HttpResponse.json({ instrumentId: 'NSE:A', resolvedId: 'NSE:A', interval: '1', ref: pine.ref, inputs: {}, times: [60_000, 120_000],
      plots: [{ id: 'p0', values: [null, 42.5] }], status: { state: 'ok' }, ...(reason && { reason }) });
  }),
);
beforeAll(() => { server.listen(); });
afterEach(() => { cleanup(); bodies.length = 0; reason = undefined; failure = false; useIndicatorStore.setState({ items: [], presentation: {} }); });
afterAll(() => { server.close(); });

function Harness() {
  const { rows } = useChartIndicators('NSE:A', '1');
  return <IndicatorLegend rows={rows} />;
}

// P4-12: a saved script goes on the chart like a built-in, computed from its source.
it('computes a Pine item from its source and shows the definition\'s name', async () => {
  useIndicatorStore.getState().addPine(SOURCE, pine, { length: 7 });
  render(<Providers><Harness /></Providers>);
  expect(await screen.findByText('42.50')).toBeDefined();
  expect(screen.getByText('My band')).toBeDefined();
  expect(bodies[0]).toEqual({ symbol: 'NSE:A', interval: '1', indicator: { kind: 'pine', source: SOURCE, inputs: { length: 7 } }, range: { limit: 500 } });
});

it('shows the result reason as a muted note', async () => {
  reason = 'request.security: no data for NSE:B';
  useIndicatorStore.getState().addPine(SOURCE, pine);
  render(<Providers><Harness /></Providers>);
  expect((await screen.findByTestId('indicator-reason')).textContent).toBe(reason);
});

it('shows a Pine compile error in the row', async () => {
  failure = true;
  useIndicatorStore.getState().addPine(SOURCE, pine);
  render(<Providers><Harness /></Providers>);
  expect((await screen.findByRole('alert')).textContent).toBe('Script error: line 2');
});

it('edits a Pine input in the settings dialog and the next compute carries it', async () => {
  useIndicatorStore.getState().addPine(SOURCE, pine);
  render(<Providers><Harness /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: 'Settings for My band' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Length' }), { target: { value: '8' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ok' }));
  await screen.findByText('42.50');
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(bodies.at(-1)).toMatchObject({ indicator: { kind: 'pine', source: SOURCE, inputs: { length: 8 } } });
});

it('sends a Pine parent as pine when a built-in is chained on it', async () => {
  const { addPine, add } = useIndicatorStore.getState();
  addPine(SOURCE, pine);
  const parent = useIndicatorStore.getState().items[0]?.key ?? '';
  add('sma', { length: 3, source: { from: parent, plot: 'p0' } });
  render(<Providers><Harness /></Providers>);
  await screen.findAllByTestId('indicator-legend-row');
  await new Promise(resolve => setTimeout(resolve, 100));
  const child = bodies.find(b => typeof b === 'object' && b && 'others' in b);
  expect(child).toMatchObject({ indicator: { kind: 'builtin', id: 'sma' }, others: [{ instanceId: parent, label: 'My band 5', indicator: { kind: 'pine', source: SOURCE, inputs: {} } }] });
});

it('builds a builtin spec for a catalog item', () => {
  expect(specOf({ key: 'k', id: 'sma', inputs: { length: 2 } })).toEqual({ kind: 'builtin', id: 'sma', inputs: { length: 2 } });
});
