import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { IndicatorDefinition, IndicatorPreset, IndicatorTemplate } from '@aitrader/contracts';
import { Providers } from '../../app/providers';
import { IndicatorLegend } from './indicator-legend';
import { IndicatorPicker } from './indicator-picker';
import { IndicatorTemplatesMenu } from './indicator-templates-menu';
import { useIndicatorStore } from './state/indicator-store';
import { useChartIndicators } from './use-chart-indicators';

const sma: IndicatorDefinition = {
  ref: 'builtin:sma@1', id: 'sma', version: 1, name: 'Moving Average Simple', shortName: 'SMA', overlay: true, levels: [],
  inputs: [{ id: 'length', title: 'Length', type: 'int', default: 9, min: 1, max: 5000 }, { id: 'source', title: 'Source', type: 'source', default: 'close' }],
  plots: [{ id: 'ma', title: 'MA', kind: 'line', color: 'blue', lineWidth: 1 }],
};
const csrf = { 'x-requested-with': 'aitrader' };
let presets: IndicatorPreset[] = [];
let templates: IndicatorTemplate[] = [];
const writes: { method: string; url: string; body: unknown }[] = [];
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const server = setupServer(
  http.get('/api/v1/indicators', () => HttpResponse.json({ indicators: [sma] })),
  http.post('/api/v1/indicators/compute', () => HttpResponse.json({ instrumentId: 'NSE:A', resolvedId: 'NSE:A', interval: '1', ref: 'builtin:sma@1', inputs: { length: 9 },
    times: [60_000], plots: [{ id: 'ma', values: [1.5] }], status: { state: 'ok' } })),
  http.get('/api/v1/indicators/presets', () => HttpResponse.json({ presets })),
  http.put('/api/v1/indicators/presets/defaults/:indicator', async ({ request, params }) => {
    expect(request.headers.get('x-requested-with')).toBe(csrf['x-requested-with']);
    const { inputs } = (await request.json()) as { inputs: IndicatorPreset['inputs'] };
    writes.push({ method: 'PUT', url: new URL(request.url).pathname, body: { inputs } });
    presets = [...presets.filter(p => !(p.name === null && p.indicatorId === params.indicator)), { id: id(), indicatorId: String(params.indicator), name: null, inputs }];
    return HttpResponse.json({ preset: presets.at(-1) });
  }),
  http.post('/api/v1/indicators/presets', async ({ request }) => {
    const body = (await request.json()) as Omit<IndicatorPreset, 'id'>;
    writes.push({ method: 'POST', url: new URL(request.url).pathname, body });
    const preset = { id: id(), ...body };
    presets = [...presets, preset];
    return HttpResponse.json({ preset }, { status: 201 });
  }),
  http.get('/api/v1/indicators/templates', () => HttpResponse.json({ templates })),
  http.post('/api/v1/indicators/templates', async ({ request }) => {
    const body = (await request.json()) as { name: string; items: IndicatorTemplate['items'] };
    writes.push({ method: 'POST', url: new URL(request.url).pathname, body });
    if (templates.some(t => t.name === body.name)) return HttpResponse.json({ code: 'CONFLICT', message: `A template named "${body.name}" already exists`, requestId: 'r1' }, { status: 409 });
    const template = { id: id(), favourite: false, ...body };
    templates = [...templates, template];
    return HttpResponse.json({ template }, { status: 201 });
  }),
  http.patch('/api/v1/indicators/templates/:id', async ({ request, params }) => {
    const { favourite } = (await request.json()) as { favourite: boolean };
    templates = templates.map(t => (t.id === params.id ? { ...t, favourite } : t));
    return HttpResponse.json({ template: templates.find(t => t.id === params.id) });
  }),
);
beforeAll(() => { server.listen(); Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => undefined }); });
beforeEach(() => { presets = []; templates = []; writes.length = 0; });
afterEach(() => { cleanup(); useIndicatorStore.setState({ items: [] }); });
afterAll(() => { server.close(); Reflect.deleteProperty(Element.prototype, 'scrollIntoView'); });

function Harness() {
  const { rows } = useChartIndicators('NSE:A', '1');
  return <><IndicatorPicker /><IndicatorTemplatesMenu /><IndicatorLegend rows={rows} /></>;
}

async function openSettings() {
  fireEvent.click(await screen.findByRole('button', { name: 'Settings for SMA' }));
  return screen.findByRole('spinbutton', { name: 'Length' });
}

// FR-IN-12
it('saves a default and a named preset from the settings dialog, then applies a preset', async () => {
  useIndicatorStore.getState().add('sma');
  render(<Providers><Harness /></Providers>);
  const length = await openSettings();

  fireEvent.change(length, { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save as default' }));
  expect(await screen.findByText('Saved as default')).toBeDefined();
  expect(writes[0]).toEqual({ method: 'PUT', url: '/api/v1/indicators/presets/defaults/sma', body: { inputs: { length: 20, source: 'close' } } });

  fireEvent.change(length, { target: { value: '200' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save preset as…' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Preset name' }), { target: { value: 'Slow' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
  expect(await screen.findByText('Saved preset Slow')).toBeDefined();
  expect(writes[1]).toEqual({ method: 'POST', url: '/api/v1/indicators/presets', body: { indicatorId: 'sma', name: 'Slow', inputs: { length: 200, source: 'close' } } });

  fireEvent.change(length, { target: { value: '5' } });
  const apply = await screen.findByRole('combobox', { name: 'Apply preset' });
  fireEvent.change(apply, { target: { value: presets.find(p => p.name === 'Slow')?.id } });
  expect((length as HTMLInputElement).value).toBe('200');
  fireEvent.click(screen.getByRole('button', { name: 'Reset settings' }));
  expect((length as HTMLInputElement).value).toBe('20');
});

it('does not save a preset while the form has an error', async () => {
  useIndicatorStore.getState().add('sma');
  render(<Providers><Harness /></Providers>);
  fireEvent.change(await openSettings(), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save as default' }));
  expect(await screen.findByText('At least 1')).toBeDefined();
  expect(writes).toEqual([]);
});

it('adds an indicator with the saved default inputs', async () => {
  presets = [{ id: id(), indicatorId: 'sma', name: null, inputs: { length: 33 } }];
  render(<Providers><Harness /></Providers>);
  const open = await screen.findByRole('button', { name: 'Indicators' });
  await waitFor(() => { expect(open.hasAttribute('disabled')).toBe(false); });
  await new Promise(resolve => setTimeout(resolve, 50));
  fireEvent.click(open);
  fireEvent.click(await screen.findByRole('option', { name: /Moving Average Simple/ }));
  expect(useIndicatorStore.getState().items[0]?.inputs).toEqual({ length: 33 });
});

// FR-IN-14
it('saves the chart set as a template, favourites it, and applies it with fresh keys and remapped sources', async () => {
  const store = useIndicatorStore.getState();
  store.add('sma');
  const parent = useIndicatorStore.getState().items[0];
  store.add('sma', { source: { from: parent?.key ?? '', plot: 'ma' } });
  render(<Providers><Harness /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: 'Templates' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Template name' }), { target: { value: 'Trend' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
  await screen.findByRole('button', { name: 'Apply Trend' });
  expect(writes[0]?.body).toMatchObject({ name: 'Trend', items: [{ id: 'sma', inputs: {} }, { id: 'sma', inputs: { source: { plot: 'ma' } } }] });

  fireEvent.click(screen.getByRole('button', { name: 'Favourite Trend' }));
  await screen.findByRole('button', { name: 'Unfavourite Trend' });
  expect(templates[0]?.favourite).toBe(true);

  useIndicatorStore.setState({ items: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Apply Trend' }));
  await waitFor(() => { expect(useIndicatorStore.getState().items).toHaveLength(2); });
  const [first, second] = useIndicatorStore.getState().items;
  expect(first?.key).not.toBe(parent?.key);
  expect(second?.inputs).toEqual({ source: { from: first?.key, plot: 'ma' } });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('shows the server message when a template name is taken', async () => {
  templates = [{ id: id(), name: 'Trend', favourite: false, items: [{ key: 'ind-1', id: 'sma', inputs: {} }] }];
  useIndicatorStore.getState().add('sma');
  render(<Providers><Harness /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: 'Templates' }));
  const list = await screen.findByRole('list', { name: 'Templates' });
  await within(list).findByRole('button', { name: 'Apply Trend' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Template name' }), { target: { value: 'Trend' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
  expect((await screen.findByRole('alert')).textContent).toContain('already exists');
});
