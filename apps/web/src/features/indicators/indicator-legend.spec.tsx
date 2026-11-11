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
const rsi: IndicatorDefinition = {
  ref: 'builtin:rsi@1', id: 'rsi', version: 1, name: 'Relative Strength Index', shortName: 'RSI', overlay: false, levels: [],
  inputs: [{ id: 'length', title: 'Length', type: 'int', default: 14, min: 1, max: 5000 }, { id: 'source', title: 'Source', type: 'source', default: 'close' }],
  plots: [{ id: 'rsi', title: 'RSI', kind: 'line', color: 'violet', lineWidth: 1 }],
};
const bodies: unknown[] = [];
const server = setupServer(
  http.get('/api/v1/indicators', () => HttpResponse.json({ indicators: [sma, rsi] })),
  http.post('/api/v1/indicators/compute', async ({ request }) => {
    const body: unknown = await request.json();
    bodies.push(body);
    if (typeof body === 'object' && body && 'indicator' in body && JSON.stringify(body.indicator).includes('"id":"rsi"')) {
      return HttpResponse.json({ instrumentId: 'NSE:A', resolvedId: 'NSE:A', interval: '1', ref: 'builtin:rsi@1', inputs: { length: 14 },
        times: [60_000, 120_000], plots: [{ id: 'rsi', values: [null, 55] }], status: { state: 'ok' } });
    }
    const length = JSON.stringify(body).includes('"length":3') ? 3 : 9;
    if (JSON.stringify(body).includes('"length":4')) return HttpResponse.json({ code: 'VALIDATION_FAILED', message: 'Input "length": too long', requestId: 'r1' }, { status: 422 });
    return HttpResponse.json({ instrumentId: 'NSE:A', resolvedId: 'NSE:A', interval: '1', ref: 'builtin:sma@1', inputs: { length },
      times: [60_000, 120_000], plots: [{ id: 'ma', values: [null, length + 0.5] }], status: { state: 'ok' } });
  }),
);
// cmdk scrolls the active item into view; jsdom has no layout.
beforeAll(() => { server.listen(); Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => undefined }); });
afterEach(() => { cleanup(); bodies.length = 0; useIndicatorStore.setState({ items: [], presentation: {} }); });
afterAll(() => { server.close(); Reflect.deleteProperty(Element.prototype, 'scrollIntoView'); });

function Harness({ interval = '1' }: { interval?: '1' | '60' }) {
  const { rows } = useChartIndicators('NSE:A', interval);
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

// FR-IN-13, E28: pick another indicator's plot as a source; remove the parent and the child says so, then recovers.
it('offers other indicators\' plots as a source, sends the chain, and shows source unavailable when the parent is removed', async () => {
  const parent = { key: 'p', id: 'rsi', inputs: {} };
  const child = { key: 'c', id: 'sma', inputs: { length: 3, source: { from: 'p', plot: 'rsi' } } };
  useIndicatorStore.setState({ items: [parent, child] });
  render(<Providers><Harness /></Providers>);
  expect(await screen.findByText('3.50')).toBeDefined();
  expect(bodies.find(body => JSON.stringify(body).includes('"instanceId":"c"'))).toMatchObject({ instanceId: 'c', label: 'SMA 3',
    indicator: { inputs: { source: { from: 'p', plot: 'rsi' } } }, others: [{ instanceId: 'p', label: 'RSI 14', indicator: { kind: 'builtin', id: 'rsi', inputs: {} } }] });

  fireEvent.click(screen.getByRole('button', { name: 'Settings for SMA' }));
  const options = Array.from(screen.getByRole('combobox', { name: 'Source' }).querySelectorAll('option')).map(o => o.textContent);
  expect(options).toEqual(['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4', 'RSI 14: RSI']);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  fireEvent.click(screen.getByRole('button', { name: 'Remove RSI' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Source unavailable');
  expect(screen.queryByText('3.50')).toBeNull();

  useIndicatorStore.setState({ items: [parent, child] });
  expect(await screen.findByText('3.50')).toBeDefined();
  expect(screen.queryByRole('alert')).toBeNull();
});

const openTab = (name: string) => { fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 }); };
const openSettings = async (name: string) => { fireEvent.click(await screen.findByRole('button', { name: `Settings for ${name}` })); };

// FR-IN-10: presentation is web-side, so a style change never reaches the compute endpoint.
it('applies a style and precision without a compute request, and shows the precision in the legend', async () => {
  useIndicatorStore.setState({ items: [{ key: 'k', id: 'sma', inputs: {} }] });
  render(<Providers><Harness /></Providers>);
  expect(await screen.findByText('9.50')).toBeDefined();
  const requests = bodies.length;
  await openSettings('SMA');
  openTab('Style');
  fireEvent.change(await screen.findByRole('combobox', { name: 'MA colour' }), { target: { value: 'red' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'MA width' }), { target: { value: '3' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'MA line style' }), { target: { value: 'dotted' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'MA plot type' }), { target: { value: 'step' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Precision' }), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ok' }));
  expect(await screen.findByText('9.5000')).toBeDefined();
  expect(bodies).toHaveLength(requests);
  expect(useIndicatorStore.getState().presentation.k?.style.plots.ma).toEqual({ visible: true, color: 'red', lineWidth: 3, lineStyle: 'dotted', type: 'step' });
});

it('offers a custom colour next to the theme tokens', async () => {
  useIndicatorStore.setState({ items: [{ key: 'k', id: 'sma', inputs: {} }] });
  render(<Providers><Harness /></Providers>);
  await openSettings('SMA');
  openTab('Style');
  fireEvent.change(await screen.findByRole('combobox', { name: 'MA colour' }), { target: { value: 'custom' } });
  fireEvent.change(screen.getByLabelText('MA colour custom'), { target: { value: '#112233' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ok' }));
  expect(useIndicatorStore.getState().presentation.k?.style.plots.ma?.color).toBe('#112233');
});

// FR-IN-11
it('hides the legend values on 5m-style intervals when only hours are enabled, and shows them again on 1h', async () => {
  useIndicatorStore.setState({ items: [{ key: 'k', id: 'sma', inputs: {} }] });
  const { rerender } = render(<Providers><Harness /></Providers>);
  expect(await screen.findByText('9.50')).toBeDefined();
  await openSettings('SMA');
  openTab('Visibility');
  for (const group of ['seconds', 'minutes', 'days', 'weeks', 'months']) fireEvent.click(await screen.findByRole('checkbox', { name: `${group} enabled` }));
  fireEvent.click(screen.getByRole('button', { name: 'Ok' }));
  expect(await screen.findByText('hidden on this interval')).toBeDefined();
  rerender(<Providers><Harness interval="60" /></Providers>);
  expect(await screen.findByText('9.50')).toBeDefined();
  expect(screen.queryByText('hidden on this interval')).toBeNull();
});

// FR-IN-10: the pane choice exists only for an indicator fed by another.
it('offers the pane choice for a chained child only', async () => {
  const parent = { key: 'p', id: 'rsi', inputs: {} };
  useIndicatorStore.setState({ items: [parent, { key: 'c', id: 'sma', inputs: { length: 3, source: { from: 'p', plot: 'rsi' } } }] });
  render(<Providers><Harness /></Providers>);
  await openSettings('RSI');
  openTab('Style');
  expect(screen.queryByRole('combobox', { name: 'Pane' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await openSettings('SMA');
  openTab('Style');
  const pane = await screen.findByRole('combobox', { name: 'Pane' });
  expect(Array.from(pane.querySelectorAll('option')).map(o => o.textContent)).toEqual(["Parent's pane", 'Own pane', 'Price pane']);
  fireEvent.change(pane, { target: { value: 'price' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ok' }));
  expect(useIndicatorStore.getState().presentation.c?.style.pane).toBe('price');
});

it('cancel keeps the stored style, reset to defaults restores the definition\'s look and stores nothing', async () => {
  useIndicatorStore.setState({ items: [{ key: 'k', id: 'sma', inputs: {} }] });
  render(<Providers><Harness /></Providers>);
  await openSettings('SMA');
  openTab('Style');
  fireEvent.change(await screen.findByRole('combobox', { name: 'MA colour' }), { target: { value: 'red' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(useIndicatorStore.getState().presentation).toEqual({});

  await openSettings('SMA');
  openTab('Style');
  fireEvent.change(await screen.findByRole('combobox', { name: 'MA colour' }), { target: { value: 'red' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'MA colour' }).value).toBe('blue');
  openTab('Visibility');
  fireEvent.click(await screen.findByRole('checkbox', { name: 'hours enabled' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
  expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'hours enabled' }).checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Ok' }));
  expect(useIndicatorStore.getState().presentation).toEqual({});
});
