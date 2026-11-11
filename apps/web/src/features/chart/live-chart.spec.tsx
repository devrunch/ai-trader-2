import { act, cleanup, render, screen } from '@testing-library/react';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { Bar, DataStatus } from '@aitrader/contracts';
import type { IndicatorHandlers, SeriesHandlers } from '../../shared/live';
import type { ChartLike } from './chart-adapter';

const subscriptions: Array<{ symbol: string; interval: string; handlers: SeriesHandlers; off: ReturnType<typeof vi.fn> }> = [];
const mergeHistory = vi.fn();
const watches: Array<{ instanceId: string; spec: unknown; handlers: IndicatorHandlers; stop: ReturnType<typeof vi.fn> }> = [];
vi.mock('../../shared/live/live-connection', () => ({
  liveClient: () => ({
    subscribe: (symbol: string, interval: string, handlers: SeriesHandlers) => {
      const off = vi.fn(); subscriptions.push({ symbol, interval, handlers, off }); return off;
    },
    watchIndicator: (_symbol: string, _interval: string, instanceId: string, spec: unknown, handlers: IndicatorHandlers) => {
      const stop = vi.fn(); watches.push({ instanceId, spec, handlers, stop }); return stop;
    },
    mergeHistory,
  }),

}));

let scroll: ((from: number | null) => void) | undefined;
const charts: ChartLike[] = [];
const indicatorUpdates: Array<ReturnType<typeof vi.fn>> = [];
const candleUpdates: Array<ReturnType<typeof vi.fn>> = [];
vi.mock('./lwc-chart', () => ({
  createLwcChart: (): ChartLike => {
    const update = vi.fn(); candleUpdates.push(update);
    const chart: ChartLike = {
      candles: { setData: vi.fn(), update }, volume: { setData: vi.fn(), update: vi.fn() },
      onCrosshair: () => () => undefined, onVisibleRange: cb => { scroll = cb; return () => undefined; }, applyColors: vi.fn(), remove: vi.fn(),
      addIndicatorSeries: () => { const update = vi.fn(); indicatorUpdates.push(update); return { setData: vi.fn(), update, applyStyle: vi.fn(), setLevels: vi.fn(), remove: vi.fn() }; },
    };
    charts.push(chart);
    return chart;
  },
}));

const { LiveChart } = await import('./live-chart');
const { useIndicatorStore } = await import('../indicators');
const { Providers } = await import('../../app/providers');

const t0 = Date.UTC(2026, 10, 9, 3, 45);
const bar = (minute: number): Bar => ({ time: t0 + minute * 60_000, open: 10, high: 11, low: 9, close: 10.5, volume: 2 });
const page = (bars: Bar[]) => ({ instrumentId: 'NSE:A', resolvedId: 'NSE:A', interval: '1', bars, nextBefore: null, status: { state: 'ok' } });
let pageDelay = 0;
let computeTimes = [t0];
const requested: string[] = [];
const computes: unknown[] = [];
const sma = { ref: 'builtin:sma@1', id: 'sma', version: 1, name: 'SMA', shortName: 'SMA', overlay: true, levels: [], inputs: [],
  plots: [{ id: 'ma', title: 'MA', kind: 'line', color: 'blue', lineWidth: 1 }] };
const server = setupServer(http.get('/api/v1/bars', async ({ request }) => {
  requested.push(new URL(request.url).search);
  await delay(pageDelay);
  return HttpResponse.json(page([bar(-2), bar(-1)]));
}), http.get('/api/v1/indicators', () => HttpResponse.json({ indicators: [sma] })),
http.post('/api/v1/indicators/compute', async ({ request }) => {
  computes.push(await request.json());
  return HttpResponse.json({ instrumentId: 'NSE:A', resolvedId: 'NSE:A', interval: '1', ref: 'builtin:sma@1', inputs: {}, times: computeTimes, plots: [{ id: 'ma', values: computeTimes.map(() => 1) }], status: { state: 'ok' } });
}));
beforeAll(() => { server.listen(); });
beforeEach(() => { computeTimes = [t0]; computes.length = 0; useIndicatorStore.setState({ items: [] }); subscriptions.length = 0; charts.length = 0; candleUpdates.length = 0; requested.length = 0; mergeHistory.mockReset(); pageDelay = 0; });
afterEach(() => { cleanup(); });
afterAll(() => { server.close(); });

it('streams the series into the chart without React state', () => {
  render(<Providers><LiveChart symbol="NSE:A" interval="1" /></Providers>);
  expect(screen.getByRole('status', { name: 'Loading chart' })).toBeDefined();
  const sub = subscriptions[0];
  act(() => { sub?.handlers.onReset([bar(0), bar(1)]); sub?.handlers.onStatus({ state: 'ok' }); });
  expect(screen.queryByRole('status', { name: 'Loading chart' })).toBeNull();
  sub?.handlers.onUpdate(bar(1));
  expect(candleUpdates[0]).toHaveBeenCalled();
});

it('paints the latest page over HTTP even if the socket never delivers (robust first paint)', async () => {
  render(<Providers><LiveChart symbol="NSE:A" interval="1" /></Providers>);
  await vi.waitFor(() => { expect(mergeHistory).toHaveBeenCalledWith('NSE:A', '1', [bar(-2), bar(-1)]); });
  expect(requested[0]).not.toContain('before=');
});

it('scrolling left loads the older page and merges it', async () => {
  render(<Providers><LiveChart symbol="NSE:A" interval="1" /></Providers>);
  act(() => { subscriptions[0]?.handlers.onReset([bar(0), bar(1)]); });
  act(() => { scroll?.(2); });
  await vi.waitFor(() => { expect(mergeHistory).toHaveBeenCalledWith('NSE:A', '1', [bar(-2), bar(-1)]); });
  expect(requested.some(search => search.includes(`before=${String(t0)}`))).toBe(true);
});

it('switching symbol during a slow load drops the old answer (E15)', async () => {
  pageDelay = 200;
  const view = render(<Providers><LiveChart symbol="NSE:A" interval="1" /></Providers>);
  act(() => { subscriptions[0]?.handlers.onReset([bar(0)]); });
  act(() => { scroll?.(1); });
  view.rerender(<Providers><LiveChart symbol="NSE:B" interval="1" /></Providers>);
  expect(subscriptions[0]?.off).toHaveBeenCalled();
  expect(subscriptions[1]?.symbol).toBe('NSE:B');
  await new Promise(resolve => setTimeout(resolve, 300));
  expect(mergeHistory.mock.calls.filter(call => call[0] === 'NSE:A')).toEqual([]);
});

it('market closed or provider down says why instead of an empty canvas (FR-UI-7)', () => {
  render(<Providers><LiveChart symbol="NSE:A" interval="1" /></Providers>);
  const closed: DataStatus = { state: 'stale', reason: 'MARKET_CLOSED' };
  act(() => { subscriptions[0]?.handlers.onReset([]); subscriptions[0]?.handlers.onStatus(closed); });
  expect(screen.getByText(/Market closed/)).toBeDefined();
});

it('indicators load once over HTTP, then each tick arrives over the socket straight to the chart (FR-IN-5)', async () => {
  useIndicatorStore.setState({ items: [{ key: 'k', id: 'sma', inputs: { length: 2 } }] });
  render(<Providers><LiveChart symbol="NSE:A" interval="1" /></Providers>);
  act(() => { subscriptions[0]?.handlers.onReset([bar(0), bar(1)]); });
  await vi.waitFor(() => { expect(computes).toHaveLength(1); });
  expect(watches.map(w => [w.instanceId, w.spec])).toEqual([['k', { kind: 'builtin', id: 'sma', inputs: { length: 2 } }]]);
  expect(await screen.findAllByTestId('indicator-legend-row')).toHaveLength(1);
  act(() => { subscriptions[0]?.handlers.onUpdate(bar(2)); watches[0]?.handlers.onUpdate({ barTime: t0 + 120_000, values: { ma: 7 } }); });
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(computes).toHaveLength(1); // no refetch per bar
  expect(indicatorUpdates.at(-1)).toHaveBeenCalledWith({ time: t0 / 1000 + 120, value: 7 });
});

// B2: bars the indicator was computed on but the chart lacks (e.g. history filled after the chart's page was read) are fetched.
it('refetches the latest page when an indicator holds bars the chart does not', async () => {
  computeTimes = [t0, t0 + 5 * 60_000, t0 + 10 * 60_000];
  useIndicatorStore.setState({ items: [{ key: 'k', id: 'sma', inputs: { length: 2 } }] });
  render(<Providers><LiveChart symbol="NSE:A" interval="1" /></Providers>);
  act(() => { subscriptions[0]?.handlers.onReset([bar(0), bar(10)]); });
  await vi.waitFor(() => { expect(requested.filter(search => !search.includes('before='))).toHaveLength(2); });
});

it('does not refetch when the chart holds every bar the indicator was computed on', async () => {
  useIndicatorStore.setState({ items: [{ key: 'k', id: 'sma', inputs: { length: 2 } }] });
  render(<Providers><LiveChart symbol="NSE:A" interval="1" /></Providers>);
  act(() => { subscriptions[0]?.handlers.onReset([bar(0), bar(1)]); });
  await vi.waitFor(() => { expect(computes).toHaveLength(1); });
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(requested.filter(search => !search.includes('before='))).toHaveLength(1);
});
