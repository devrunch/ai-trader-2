import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import type { IndicatorDefinition } from '@aitrader/contracts';
import { Providers } from '../../app/providers';
import { IndicatorLegend } from './indicator-legend';
import { IndicatorPicker } from './indicator-picker';
import { useIndicatorStore } from './state/indicator-store';
import { useChartIndicators } from './use-chart-indicators';

const sma: IndicatorDefinition = {
  ref: 'builtin:sma@1', id: 'sma', version: 1, name: 'Moving Average Simple', shortName: 'SMA', overlay: true, levels: [],
  inputs: [{ id: 'length', title: 'Length', type: 'int', default: 9, min: 1, max: 5000 }, { id: 'source', title: 'Source', type: 'source', default: 'close' }],
  plots: [{ id: 'ma', title: 'MA', kind: 'line', color: 'blue', lineWidth: 1 }],
};
const bodies: unknown[] = [];
const server = setupServer(
  http.get('/api/v1/indicators', () => HttpResponse.json({ indicators: [sma] })),
  http.post('/api/v1/indicators/compute', async ({ request }) => {
    const body: unknown = await request.json();
    bodies.push(body);
    const length = JSON.stringify(body).includes('"length":3') ? 3 : 9;
    if (JSON.stringify(body).includes('"length":4')) return HttpResponse.json({ code: 'VALIDATION_FAILED', message: 'Input "length": too long', requestId: 'r1' }, { status: 422 });
    return HttpResponse.json({ instrumentId: 'NSE:A', resolvedId: 'NSE:A', interval: '1', ref: 'builtin:sma@1', inputs: { length },
      times: [60_000, 120_000], plots: [{ id: 'ma', values: [null, length + 0.5] }], status: { state: 'ok' } });
  }),
);
// cmdk scrolls the active item into view; jsdom has no layout.
beforeAll(() => { server.listen(); Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => undefined }); });
afterEach(() => { cleanup(); bodies.length = 0; useIndicatorStore.setState({ items: [] }); });
afterAll(() => { server.close(); Reflect.deleteProperty(Element.prototype, 'scrollIntoView'); });

function Harness() {
  const { rows } = useChartIndicators('NSE:A', '1');
  return <><IndicatorPicker /><IndicatorLegend rows={rows} /></>;
}

// FR-IN-9, FR-IN-15: add from the catalog, see values, change inputs in the settings dialog, remove.
it('adds an indicator, edits its inputs and removes it', async () => {
  render(<Providers><Harness /></Providers>);
  const open = await screen.findByRole('button', { name: 'Indicators' });
  await waitFor(() => { expect(open.hasAttribute('disabled')).toBe(false); });
  fireEvent.click(open);
  fireEvent.click(await screen.findByRole('option', { name: /Moving Average Simple/ }));
  expect(await screen.findByText('9.50')).toBeDefined();
  expect(bodies[0]).toEqual({ symbol: 'NSE:A', interval: '1', indicator: { kind: 'builtin', id: 'sma', inputs: {} }, range: { limit: 500 } });

  fireEvent.click(screen.getByRole('button', { name: 'Settings for SMA' }));
  const length = screen.getByRole('spinbutton', { name: 'Length' });
  fireEvent.change(length, { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ok' }));
  expect(screen.getByRole('alert').textContent).toBe('At least 1');
  fireEvent.change(length, { target: { value: '3' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Source' }), { target: { value: 'hl2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ok' }));
  expect(await screen.findByText('3.50')).toBeDefined();
  expect(bodies.at(-1)).toMatchObject({ indicator: { inputs: { length: 3, source: 'hl2' } } });
  expect(screen.getByText('3 hl2')).toBeDefined();

  fireEvent.click(screen.getByRole('button', { name: 'Remove SMA' }));
  expect(screen.queryAllByTestId('indicator-legend-row')).toHaveLength(0);
});

it('says why an indicator failed', async () => {
  useIndicatorStore.setState({ items: [{ key: 'k', id: 'sma', inputs: { length: 4 } }] });
  render(<Providers><Harness /></Providers>);
  expect((await screen.findByRole('alert')).textContent).toBe('Input "length": too long');
});
