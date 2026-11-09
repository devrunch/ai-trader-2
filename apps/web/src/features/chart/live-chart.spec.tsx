import { act, cleanup, render, screen } from '@testing-library/react';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { Bar, DataStatus } from '@aitrader/contracts';
import type { SeriesHandlers } from '../../shared/live';
import type { ChartLike } from './chart-adapter';

const subscriptions: Array<{ symbol: string; interval: string; handlers: SeriesHandlers; off: ReturnType<typeof vi.fn> }> = [];
const mergeHistory = vi.fn();
vi.mock('../../shared/live/live-connection', () => ({
  liveClient: () => ({
    subscribe: (symbol: string, interval: string, handlers: SeriesHandlers) => {
      const off = vi.fn(); subscriptions.push({ symbol, interval, handlers, off }); return off;
    },
    mergeHistory,
  }),

}));

let scroll: ((from: number | null) => void) | undefined;
const charts: ChartLike[] = [];
const candleUpdates: Array<ReturnType<typeof vi.fn>> = [];
vi.mock('./lwc-chart', () => ({
  createLwcChart: (): ChartLike => {
    const update = vi.fn(); candleUpdates.push(update);
    const chart: ChartLike = {
      candles: { setData: vi.fn(), update }, volume: { setData: vi.fn(), update: vi.fn() },
      onVisibleRange: cb => { scroll = cb; return () => undefined; }, applyColors: vi.fn(), remove: vi.fn(),
    };
    charts.push(chart);
    return chart;
  },
}));

const { LiveChart } = await import('./live-chart');
const { Providers } = await import('../../app/providers');

const t0 = Date.UTC(2026, 10, 9, 3, 45);
const bar = (minute: number): Bar => ({ time: t0 + minute * 60_000, open: 10, high: 11, low: 9, close: 10.5, volume: 2 });
const page = (bars: Bar[]) => ({ instrumentId: 'NSE:A', resolvedId: 'NSE:A', interval: '1', bars, nextBefore: null, status: { state: 'ok' } });
let pageDelay = 0;
const requested: string[] = [];
const server = setupServer(http.get('/api/v1/bars', async ({ request }) => {
  requested.push(new URL(request.url).search);
  await delay(pageDelay);
  return HttpResponse.json(page([bar(-2), bar(-1)]));
}));
beforeAll(() => { server.listen(); });
beforeEach(() => { subscriptions.length = 0; charts.length = 0; candleUpdates.length = 0; requested.length = 0; mergeHistory.mockReset(); pageDelay = 0; });
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

it('scrolling left loads the older page and merges it', async () => {
  render(<Providers><LiveChart symbol="NSE:A" interval="1" /></Providers>);
  act(() => { subscriptions[0]?.handlers.onReset([bar(0), bar(1)]); });
  act(() => { scroll?.(2); });
  await vi.waitFor(() => { expect(mergeHistory).toHaveBeenCalledWith('NSE:A', '1', [bar(-2), bar(-1)]); });
  expect(requested[0]).toContain(`before=${String(t0)}`);
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
  expect(mergeHistory).not.toHaveBeenCalled();
});

it('market closed or provider down says why instead of an empty canvas (FR-UI-7)', () => {
  render(<Providers><LiveChart symbol="NSE:A" interval="1" /></Providers>);
  const closed: DataStatus = { state: 'stale', reason: 'MARKET_CLOSED' };
  act(() => { subscriptions[0]?.handlers.onReset([]); subscriptions[0]?.handlers.onStatus(closed); });
  expect(screen.getByText(/Market closed/)).toBeDefined();
});
