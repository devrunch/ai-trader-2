import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { IndicatorDefinition } from '@aitrader/contracts';
import { Providers } from '../../app/providers';
import { IndicatorLegend } from './indicator-legend';
import { IndicatorPicker } from './indicator-picker';
import { PineHelp } from './pine/pine-help';
import { usePineDialog } from './pine/pine-dialog-store';
import { useIndicatorStore } from './state/indicator-store';
import { useChartIndicators } from './use-chart-indicators';

vi.mock('./pine/pine-editor.lazy', () => ({
  LazyPineEditor: ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) =>
    <textarea aria-label={label} value={value} onChange={e => { onChange(e.target.value); }} />,
}));

const hash = 'a'.repeat(64);
const scriptDef: IndicatorDefinition = {
  ref: 'pine:0123456789ab@1', id: 'mine', version: 1, name: 'Mine', shortName: 'Mine', overlay: false, levels: [],
  inputs: [{ id: 'length', title: 'Length', type: 'int', default: 14, min: 1, max: 500 }],
  plots: [{ id: 'p0', title: 'SMA', kind: 'line', color: 'blue', lineWidth: 1 }],
};
const detail = (version: number, source = 'src') => ({
  id: '11111111-1111-4111-8111-111111111111', name: 'Mine', currentVersion: 2, sourceHash: hash, updatedAt: '2026-01-01', source, shownVersion: version,
  versions: [{ version: 2, sourceHash: hash, createdAt: '2026-01-02' }, { version: 1, sourceHash: hash, createdAt: '2026-01-01' }],
});
const calls: string[] = [];
let deleted = false;
const server = setupServer(
  http.get('/api/v1/indicators', () => HttpResponse.json({ indicators: [] })),
  http.post('/api/v1/indicators/compute', () => HttpResponse.json({ code: 'VALIDATION_FAILED', message: 'x', requestId: 'r' }, { status: 422 })),
  http.post('/api/v1/indicators/describe', async ({ request }) => {
    const body = await request.json() as { source: string };
    calls.push('describe');
    if (body.source.includes('broken')) return HttpResponse.json({ code: 'VALIDATION_FAILED', message: 'Unexpected token', details: { line: 3 }, requestId: 'r' }, { status: 422 });
    return HttpResponse.json({ definition: scriptDef });
  }),
  http.get('/api/v1/pine-scripts', () => HttpResponse.json({ scripts: deleted ? [] : [{ id: detail(2).id, name: 'Mine', currentVersion: 2, sourceHash: hash, updatedAt: '2026-01-02' }] })),
  http.post('/api/v1/pine-scripts', () => { calls.push('create'); return HttpResponse.json(detail(1)); }),
  http.put('/api/v1/pine-scripts/:id', () => { calls.push('save'); return HttpResponse.json(detail(2)); }),
  http.get('/api/v1/pine-scripts/:id', ({ request }) => HttpResponse.json(detail(Number(new URL(request.url).searchParams.get('version') ?? 2), 'opened source'))),
  http.delete('/api/v1/pine-scripts/:id', () => { deleted = true; return new HttpResponse(null, { status: 204 }); }),
);
beforeAll(() => { server.listen(); Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => undefined }); });
afterEach(() => { cleanup(); calls.length = 0; deleted = false; usePineDialog.setState({ target: null }); useIndicatorStore.setState({ items: [], presentation: {} }); });
afterAll(() => { server.close(); Reflect.deleteProperty(Element.prototype, 'scrollIntoView'); });

function Harness() {
  const { rows } = useChartIndicators('NSE:A', '1');
  return <><IndicatorPicker /><IndicatorLegend rows={rows} /></>;
}
const openPicker = async () => { await waitFor(() => { expect(screen.getByRole('button', { name: /Indicators/ })).toHaveProperty('disabled', false); }); fireEvent.click(screen.getByRole('button', { name: /Indicators/ })); };
const openNew = async () => {
  render(<Providers><Harness /></Providers>);
  await openPicker();
  fireEvent.click(await screen.findByText('New Pine script'));
  return screen.findByLabelText('Pine source');
};

// FR-IN-27: Add to chart checks the script, then adds it with the script's definition.
it('describes then adds the script to the chart', async () => {
  await openNew();
  fireEvent.click(screen.getByRole('button', { name: 'Add to chart' }));
  await waitFor(() => { expect(useIndicatorStore.getState().items).toHaveLength(1); });
  const item = useIndicatorStore.getState().items[0];
  expect(item?.pine?.definition.inputs.map(i => i.id)).toEqual(['length']);
  expect(calls).toEqual(['describe']);
  await waitFor(() => { expect(screen.queryByLabelText('Pine source')).toBeNull(); });
});

it('shows the error line inline and does not add when the script is invalid', async () => {
  const editor = await openNew();
  fireEvent.change(editor, { target: { value: 'broken' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Line 3: Unexpected token');
  fireEvent.click(screen.getByRole('button', { name: 'Add to chart' }));
  await waitFor(() => { expect(calls).toEqual(['describe', 'describe']); });
  expect(useIndicatorStore.getState().items).toHaveLength(0);
});

it('creates on the first save and saves a new version after', async () => {
  await openNew();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => { expect(screen.getByTestId('pine-saved').textContent).toBe('v1 · aaaaaaaa'); });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => { expect(screen.getByTestId('pine-saved').textContent).toBe('v2 · aaaaaaaa'); });
  expect(calls).toEqual(['create', 'save']);
});

it('opens an older version into the editor', async () => {
  const editor = await openNew();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  fireEvent.change(await screen.findByLabelText('Version'), { target: { value: '1' } });
  await waitFor(() => { expect(editor).toHaveProperty('value', 'opened source'); });
});

it('lists, opens and deletes saved scripts', async () => {
  render(<Providers><Harness /></Providers>);
  await openPicker();
  fireEvent.click(await screen.findByText('My scripts'));
  expect(await screen.findByText('v2 · aaaaaaaa')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open Mine' }));
  expect(await screen.findByLabelText('Pine source')).toHaveProperty('value', 'opened source');
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'My scripts' }), { button: 0, ctrlKey: false });
  fireEvent.click(screen.getByRole('button', { name: 'Delete Mine' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Mine' }));
  expect(await screen.findByText(/No saved scripts yet/)).toBeTruthy();
});

it('shows an error with retry when the list fails', async () => {
  server.use(http.get('/api/v1/pine-scripts', () => HttpResponse.json({ code: 'INTERNAL', message: 'down', requestId: 'r' }, { status: 500 })));
  render(<Providers><Harness /></Providers>);
  await openPicker();
  fireEvent.click(await screen.findByText('My scripts'));
  expect((await screen.findByRole('alert')).textContent).toContain('could not be loaded');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
});

it('replaces the chart indicator instead of adding when edited from the legend', async () => {
  useIndicatorStore.getState().addPine('old source', scriptDef);
  render(<Providers><Harness /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Mine' }));
  const editor = await screen.findByLabelText('Pine source');
  expect(editor).toHaveProperty('value', 'old source');
  fireEvent.change(editor, { target: { value: 'new source' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update on chart' }));
  await waitFor(() => { expect(useIndicatorStore.getState().items[0]?.pine?.source).toBe('new source'); });
  expect(useIndicatorStore.getState().items).toHaveLength(1);
});

// FR-IN-26: the Help tab lists the generated coverage rows, supported and refused.
it('renders coverage rows grouped and filters them', () => {
  render(<PineHelp rows={[
    { group: 'ta', feature: 'ta.sma', status: 'supported', note: '' },
    { group: 'request', feature: 'request.security', status: 'refused', note: 'needs other symbols' },
  ]} />);
  expect(screen.getByText('request.security')).toBeTruthy();
  expect(screen.getByText('needs other symbols')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Filter coverage'), { target: { value: 'sma' } });
  expect(screen.queryByText('request.security')).toBeNull();
  fireEvent.change(screen.getByLabelText('Filter coverage'), { target: { value: 'zzz' } });
  expect(screen.getByText('No feature matches the filter.')).toBeTruthy();
});

it('says why the coverage list is empty', () => {
  render(<PineHelp rows={[]} />);
  expect(screen.getByText(/coverage report is empty/)).toBeTruthy();
});
