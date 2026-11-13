import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { CalendarEvents } from './index';

const spec = { measures: 'Consumer prices', usualEffect: 'Hot CPI lifts the dollar', why: 'Drives Fed policy', notes: '', source: 'ff', beat: 'higher-better' as const };
const base = { country: 'USD', impact: 'High', previous: '0.4%', moves: ['US stocks'] };
let events: unknown[] = [];
let scorecard: () => Response = () => HttpResponse.json({});
const server = setupServer(
  http.get('/api/v1/calendar', () => HttpResponse.json({ events })),
  http.get('/api/v1/calendar/scorecard', () => scorecard()),
);
beforeAll(() => { server.listen(); });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); });

const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CalendarEvents /></QueryClientProvider>);
const released = { ...base, id: 'e1', title: 'CPI m/m', at: '2026-11-12T13:30:00.000Z', forecast: '0.3%', actual: '0.5%', actualSource: 'ff', surprise: 0.2, surpriseZ: 1.4, spec,
  reactions: [{ symbol: 'NSE:NIFTY', refPrice: 25000, move5Pct: 0.12, move15Pct: 0.2, move60Pct: 0.31 }] };

it('shows actual, a surprise coloured by the spec direction and the reactions line', async () => {
  events = [released];
  show();
  expect(await screen.findByText('a 0.5%')).toBeDefined();
  expect(screen.getByLabelText('Surprise').textContent).toBe('+0.20');
  expect(screen.getByLabelText('Surprise').className).toContain('text-up');
  expect(screen.getByText('NIFTY +0.12% (5m) +0.20% (15m) +0.31% (60m)')).toBeDefined();
});

it('colours the surprise down when the spec says lower is better', async () => {
  events = [{ ...released, spec: { ...spec, beat: 'lower-better' } }];
  show();
  expect((await screen.findByLabelText('Surprise')).className).toContain('text-down');
});

it('opens the scorecard with past releases and stats when the event is clicked', async () => {
  events = [released];
  scorecard = () => HttpResponse.json({ title: 'CPI m/m', country: 'USD', spec, stats: [{ symbol: 'NSE:NIFTY', n: 2, avgAbsMove15Pct: 0.4, avgMove15WhenBeatPct: 0.3, avgMove15WhenMissPct: -0.5, followedSurprisePct: 100 }],
    releases: [{ eventId: 'p1', at: '2026-10-12T13:30:00.000Z', forecast: '0.2%', previous: '0.1%', actual: '0.3%', surprise: 0.1, surpriseZ: null, reactions: [{ symbol: 'NSE:NIFTY', refPrice: 1, move5Pct: null, move15Pct: 0.3, move60Pct: null }] }] });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'CPI m/m details' }));
  expect(await screen.findByText('NIFTY 15m')).toBeDefined();
  expect(screen.getByText('+0.30%')).toBeDefined();
  expect(screen.getByText(/Measures: Consumer prices/)).toBeDefined();
  expect(screen.getByLabelText('Scorecard stats').textContent).toContain('followed the surprise 100%');
});

it('says why when there are no past releases and offers a retry when the scorecard fails', async () => {
  events = [released];
  scorecard = () => HttpResponse.json({ title: 'CPI m/m', country: 'USD', spec: null, releases: [], stats: [] });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'CPI m/m details' }));
  expect(await screen.findByText('No past releases of this event are stored yet.')).toBeDefined();
  cleanup();
  scorecard = () => HttpResponse.json({ code: 'INTERNAL', message: 'x', requestId: 'r' }, { status: 500 });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'CPI m/m details' }));
  expect(await screen.findByText(/Scorecard unavailable/)).toBeDefined();
});

it('shows empty and error states for the list', async () => {
  events = [];
  show();
  expect(await screen.findByText(/No medium or high impact releases/)).toBeDefined();
  cleanup();
  server.use(http.get('/api/v1/calendar', () => HttpResponse.json({ code: 'INTERNAL', message: 'x', requestId: 'r' }, { status: 500 })));
  show();
  expect(await screen.findByText(/Calendar unavailable/)).toBeDefined();
});
