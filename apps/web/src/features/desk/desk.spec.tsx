import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Providers } from '../../app/providers';
import { DeskRunPane } from './index';

const ID = '00000000-0000-4000-8000-0000000000d1';
const report = { stance: 'bullish', confidence: 0.7, summary: 'Trend is up', evidence: ['Above EMA20', 'Volume rising'] };
const makeRun = (over: Record<string, unknown> = {}, decision: Record<string, unknown> = {}) => ({
  id: ID, symbol: 'NSE:NIFTY', asOf: '2026-11-11T09:30:00.000Z', live: true, createdAt: '2026-11-11T09:31:00.000Z', status: 'done',
  decision: { action: 'BUY', confidence: 0.64, entry: 100, stopLoss: 98, target: 105, quantity: 10, skill: null, summary: 'Go long', vetoed: false, vetoReasons: [], ...decision },
  trail: { data: { asOf: 'x', lastClose: 100, bars: 50, headlines: 3, events: 1 },
    reports: { news: report, technical: { ...report, evidence: ['Technical edge'] }, macro: { skipped: 'no macro data' }, fundamentals: { skipped: 'no fundamentals for an index' } },
    debate: [{ side: 'bull', round: 1, argument: 'Momentum is strong', keyPoints: ['Higher highs'], rebuttal: '' }, { side: 'bear', round: 1, argument: 'Stretched valuation', keyPoints: [], rebuttal: 'Momentum fades' }],
    proposal: { action: 'BUY', confidence: 0.64, entry: 100, stopLoss: 98, target: 105, skill: null, rationale: 'Breakout' }, riskReview: { approve: true, reasons: [] }, gate: { pass: true, blocks: [] } },
  tokens: 1234, calls: 6, error: null, ...over,
});
const scored = (asOf: string, r: number) => ({ asOf, action: 'BUY', entry: 100, stopLoss: 98, target: 104, outcome: r > 0 ? 'target' : 'stop', r, exitPrice: 104, runId: null });
const doneBacktest = { id: '00000000-0000-4000-8000-0000000000b1', symbol: 'NSE:NIFTY', status: 'done', rounds: 1, progress: { done: 2, total: 2 },
  items: [scored('2026-01-01', 2), scored('2026-01-08', -1)], summary: { trades: 2, holds: 0, hitRatePct: 50, avgR: 0.5, totalR: 1, maxDrawdownR: 1 },
  tokens: 100, createdAt: '2026-11-11T00:00:00.000Z', finishedAt: '2026-11-11T00:05:00.000Z', error: null };

let runResponse: { status: number; body: Record<string, unknown> };
let pastRuns: unknown[] = [];
let pastBacktests: unknown[] = [];
const posts: Array<Record<string, unknown>> = [];
const server = setupServer(
  http.get('/api/v1/desk/runs', () => HttpResponse.json({ items: pastRuns })),
  http.get('/api/v1/desk/runs/:id', () => HttpResponse.json(pastRuns[0] ?? runResponse.body)),
  http.post('/api/v1/desk/runs', async ({ request }) => { posts.push(await request.json() as Record<string, unknown>); return HttpResponse.json(runResponse.body, { status: runResponse.status }); }),
  http.get('/api/v1/desk/backtests', () => HttpResponse.json({ items: pastBacktests })),
  http.get('/api/v1/desk/backtests/:id', () => HttpResponse.json(doneBacktest)),
  http.post('/api/v1/desk/backtests/estimate', async ({ request }) => { posts.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ runs: 3, callsPerRun: 6, calls: 18, tokensEstimate: 40000, dailyRunsLeft: 7 }); }),
  http.post('/api/v1/desk/backtests', async ({ request }) => { posts.push(await request.json() as Record<string, unknown>); return HttpResponse.json(doneBacktest); }),
);
beforeAll(() => { server.listen(); });
beforeEach(() => { runResponse = { status: 200, body: makeRun() }; pastRuns = []; pastBacktests = []; posts.length = 0; });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); });

function Pane({ onClose = () => undefined }: { onClose?: () => void }) {
  return <Providers><DeskRunPane runId={ID} onClose={onClose} /></Providers>;
}

it('a run that is still working shows its progress', async () => {
  runResponse = { status: 200, body: makeRun({ status: 'running', trail: { ...makeRun().trail, debate: [], proposal: null, riskReview: null } }) };
  render(<Pane />);
  const progress = await screen.findByRole('status', { name: 'Desk progress' });
  expect(progress.textContent).toContain('Bull vs bear…');
  expect(screen.queryByLabelText('Decision action')).toBeNull();
});

it('shows the decision, the roles and the debate of a finished run, and closes', async () => {
  const onClose = vi.fn();
  render(<Pane onClose={onClose} />);
  expect((await screen.findByLabelText('Decision action')).textContent).toBe('BUY');
  expect(screen.getByText('Momentum is strong')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalled();
});

it('shows the veto reasons prominently and skipped roles', async () => {
  runResponse = { status: 200, body: makeRun({}, { vetoed: true, vetoReasons: ['Daily loss limit reached'] }) };
  render(<Pane />);
  expect((await screen.findByRole('alert')).textContent).toBe('Risk manager blocked this trade: Daily loss limit reached');
  expect(within(screen.getByRole('region', { name: 'Fundamentals' })).getByText('Skipped: no fundamentals for an index')).toBeDefined();
});

it('says the run was stopped by the token budget', async () => {
  runResponse = { status: 200, body: makeRun({ status: 'budget' }) };
  render(<Pane />);
  expect((await screen.findByRole('alert')).textContent).toContain('stopped by the token budget');
});

it('labels a replayed run as a time machine', async () => {
  pastRuns = [makeRun({ live: false })];
  render(<Pane />);
  expect(await screen.findByText('time machine')).toBeDefined();
});

it('enables Start backtest only after an estimate, then shows the results table and summary', async () => {
  render(<Pane />);
  await screen.findByLabelText('Start date');
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-01-01' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-01-15' } });
  const startButton = screen.getByRole('button', { name: 'Start backtest' });
  expect(startButton).toHaveProperty('disabled', true);
  expect(screen.getByText('3 dates')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Estimate cost' }));
  expect(await screen.findByText('3 runs, ~18 model calls, ~40000 tokens (daily runs left: 7)')).toBeDefined();
  expect(posts[0]).toMatchObject({ symbol: 'NSE:NIFTY', dates: ['2026-01-01', '2026-01-08', '2026-01-15'], rounds: 1 });
  await waitFor(() => { expect(startButton).toHaveProperty('disabled', false); });
  fireEvent.click(startButton);
  const table = await screen.findByRole('table', { name: 'Backtest results' });
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  expect(within(table).getByText('2.00').className).toContain('text-up');
  expect(within(table).getByText('-1.00').className).toContain('text-down');
});

it('refuses more than 30 dates with a message', async () => {
  render(<Pane />);
  await screen.findByLabelText('Start date');
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-01-01' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-06-01' } });
  fireEvent.change(screen.getByLabelText('Step in days'), { target: { value: '1' } });
  expect(screen.getByText(/is more than the limit of 30/)).toBeDefined();
  expect(screen.getByRole('button', { name: 'Estimate cost' })).toHaveProperty('disabled', true);
});
