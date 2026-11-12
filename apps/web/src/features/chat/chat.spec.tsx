import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { useIndicatorStore } from '../indicators';
import { Providers } from '../../app/providers';
import { ChatPanel } from './index';

const sse = (chunks: unknown[]) => new HttpResponse([...chunks.map(c => `data: ${JSON.stringify(c)}\n\n`), 'data: [DONE]\n\n'].join(''),
  { headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } });
const answer = [
  { type: 'start', messageId: 'a1' }, { type: 'start-step' },
  { type: 'tool-input-available', toolCallId: 'c1', toolName: 'getQuote', input: { symbol: 'NSE:RELIANCE' } },
  { type: 'tool-output-available', toolCallId: 'c1', output: { ok: true, data: { price: 1325 } } },
  { type: 'finish-step' }, { type: 'start-step' },
  { type: 'text-start', id: 't1' }, { type: 'text-delta', id: 't1', delta: 'RELIANCE last traded at 1325.' }, { type: 'text-end', id: 't1' },
  { type: 'data-notice', data: { kind: 'budget', reason: 'tokens', text: 'This answer used up the per-turn token budget.' } },
  { type: 'finish-step' }, { type: 'finish' },
];

let enabled = true;
const sent: unknown[] = [];
const server = setupServer(
  http.get('/api/v1/agent/status', () => HttpResponse.json({ enabled, model: enabled ? 'xai/grok-4' : null })),
  http.get('/api/v1/agent/threads', () => HttpResponse.json([])),
  http.get('/api/v1/agent/threads/:id', () => HttpResponse.json({ code: 'NOT_FOUND', message: 'Chat not found', requestId: 'r' }, { status: 404 })),
  http.post('/api/v1/agent/chat', async ({ request }) => { sent.push(await request.json()); return sse(answer); }),
);
beforeAll(() => { server.listen(); });
beforeEach(() => { enabled = true; sent.length = 0; });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); });

it('says plainly when no model is configured (FR-AG-1)', async () => {
  enabled = false;
  render(<Providers><ChatPanel /></Providers>);
  expect(await screen.findByText(/not configured on this server/)).toBeDefined();
});

it('sends only the new message and streams the answer with the data used and any budget notice (FR-AG-8)', async () => {
  render(<Providers><ChatPanel /></Providers>);
  fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Price of Reliance?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByText('RELIANCE last traded at 1325.')).toBeDefined();
  expect(screen.getByText('getQuote')).toBeDefined();
  expect(screen.getByText('data used')).toBeDefined();
  expect(screen.getByRole('status').textContent).toContain('per-turn token budget');
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ message: { role: 'user', parts: [{ type: 'text', text: 'Price of Reliance?' }] } });
  expect(Object.keys(sent[0] as object).sort()).toEqual(['id', 'message']);
  expect(screen.getByText('Model: xai/grok-4')).toBeDefined();
});

const cardId = '00000000-0000-4000-8000-0000000000c1';
const card = (patch: Record<string, unknown> = {}) => ({ id: cardId, action: { kind: 'add-indicator', indicatorId: 'rsi', inputs: { length: 14 } },
  state: 'pending', reason: null, expiresAt: '2026-11-10T10:15:00.000Z', drawing: null, ...patch });
const proposal = (output: unknown) => [
  { type: 'start', messageId: 'a2' }, { type: 'start-step' },
  { type: 'tool-input-available', toolCallId: 'p1', toolName: 'proposeChartAction', input: {} },
  { type: 'tool-output-available', toolCallId: 'p1', output: { ok: true, data: output } },
  { type: 'finish-step' }, { type: 'finish' },
];

async function ask(text: string) {
  fireEvent.change(await screen.findByLabelText('Message'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

it('applies a proposed indicator with the inputs the user edited, once (FR-AG-17)', async () => {
  useIndicatorStore.setState({ items: [] });
  const applied: unknown[] = [];
  server.use(
    http.post('/api/v1/agent/chat', () => sse(proposal(card()))),
    http.get(`/api/v1/agent/actions/${cardId}`, () => HttpResponse.json(card())),
    http.post(`/api/v1/agent/actions/${cardId}/apply`, async ({ request }) => {
      const body = await request.json() as { action?: { inputs: Record<string, unknown> } };
      applied.push(body);
      return HttpResponse.json(card({ state: 'applied', action: { kind: 'add-indicator', indicatorId: 'rsi', inputs: body.action?.inputs ?? { length: 14 } } }));
    }),
  );
  render(<Providers><ChatPanel /></Providers>);
  await ask('Add RSI');
  expect(await screen.findByText('Add RSI to the chart')).toBeDefined();
  fireEvent.change(screen.getByLabelText('length'), { target: { value: '21' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(await screen.findByText('applied')).toBeDefined();
  expect(applied).toEqual([{ action: { kind: 'add-indicator', indicatorId: 'rsi', inputs: { length: 21 } } }]);
  expect(useIndicatorStore.getState().items).toMatchObject([{ id: 'rsi', inputs: { length: 21 } }]);
  expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
});

it('opens a proposed symbol through the host screen', async () => {
  const openSymbol = vi.fn();
  let open = card({ action: { kind: 'open-symbol', symbol: 'NSE:INFY', interval: '15' } });
  server.use(
    http.post('/api/v1/agent/chat', () => sse(proposal(open))),
    http.get(`/api/v1/agent/actions/${cardId}`, async () => { await new Promise(r => setTimeout(r, 50)); return HttpResponse.json(open); }),
    http.post(`/api/v1/agent/actions/${cardId}/apply`, () => { open = { ...open, state: 'applied' }; return HttpResponse.json(open); }),
  );
  render(<Providers><ChatPanel actions={{ openSymbol, addDrawing: vi.fn() }} /></Providers>);
  await ask('Show Infosys');
  expect(await screen.findByText('Open NSE:INFY on 15')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await screen.findByText('applied');
  expect(openSymbol).toHaveBeenCalledWith('NSE:INFY', '15');
});

it('shows an expired card without Apply', async () => {
  const expired = card({ state: 'expired' });
  server.use(
    http.post('/api/v1/agent/chat', () => sse(proposal(card()))),
    http.get(`/api/v1/agent/actions/${cardId}`, () => HttpResponse.json(expired)),
  );
  render(<Providers><ChatPanel /></Providers>);
  await ask('Add RSI');
  expect(await screen.findByText('expired')).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
});

it('shows the server-computed levels before applying and draws them through the host (FR-AG-6)', async () => {
  const addDrawing = vi.fn();
  const drawing = { symbol: 'NSE:INFY', interval: '5', note: null, barsUsed: 300, lastBarTime: 2, status: { state: 'ok' },
    segments: [{ from: { time: 1, price: 1510 }, to: { time: 2, price: 1510 }, label: 'Resistance 1510.00 · 3 touches' }] };
  let current = card({ action: { kind: 'draw', intent: { kind: 'levels', symbol: 'NSE:INFY', interval: '5', bars: 300, count: 1 } }, drawing });
  server.use(
    http.post('/api/v1/agent/chat', () => sse(proposal(current))),
    http.get(`/api/v1/agent/actions/${cardId}`, () => HttpResponse.json(current)),
    http.post(`/api/v1/agent/actions/${cardId}/apply`, () => { current = { ...current, state: 'applied' }; return HttpResponse.json(current); }),
  );
  render(<Providers><ChatPanel actions={{ openSymbol: vi.fn(), addDrawing }} /></Providers>);
  await ask('Mark resistance');
  expect(await screen.findByText('Draw 1 support/resistance levels on NSE:INFY 5')).toBeDefined();
  expect(screen.getByText('Resistance 1510.00 · 3 touches')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await screen.findByText('applied');
  expect(addDrawing).toHaveBeenCalledWith(cardId, expect.objectContaining({ segments: [expect.objectContaining({ label: 'Resistance 1510.00 · 3 touches' })] }));
});

it('renders the assistant reply as markdown and never as raw HTML', async () => {
  server.use(http.post('/api/v1/agent/chat', () => sse([
    { type: 'start', messageId: 'a3' }, { type: 'start-step' }, { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: '**Closed** market.\n\n- one\n- two\n\n<img src=x onerror=alert(1)>' },
    { type: 'text-end', id: 't' }, { type: 'finish-step' }, { type: 'finish' },
  ])));
  render(<Providers><ChatPanel /></Providers>);
  await ask('status?');
  expect((await screen.findByText('Closed')).tagName).toBe('STRONG');
  expect(screen.getAllByRole('listitem').map(li => li.textContent)).toContain('one');
  expect(document.querySelector('img')).toBeNull();
});

it('lists background tasks with what wakes them, and pauses one', async () => {
  const task = { id: '00000000-0000-4000-8000-0000000000t1'.replace('t1', 'a1'), threadId: '00000000-0000-4000-8000-0000000000b1', mode: 'agent', title: 'EURUSD vs EMA 20',
    instruction: 'check', trigger: { kind: 'schedule', cron: '*/5 * * * *', tz: 'Asia/Kolkata' }, state: 'active', runs: 1, maxRuns: 2,
    lastRunAt: '2026-11-11T18:45:00.000Z', nextRunAt: '2026-11-11T18:50:00.000Z', lastError: null, lastOutcome: null, expiresAt: '2026-11-12T18:40:00.000Z', createdAt: '2026-11-11T18:40:00.000Z' };
  const verbs: string[] = [];
  server.use(
    http.get('/api/v1/agent/tasks', () => HttpResponse.json([task])),
    http.post('/api/v1/agent/tasks/:id/:verb', ({ params }) => { verbs.push(String(params.verb)); return HttpResponse.json({ ...task, state: 'paused' }); }),
  );
  render(<Providers><ChatPanel /></Providers>);
  fireEvent.click(await screen.findByRole('tab', { name: 'tasks' }));
  expect(await screen.findByText('EURUSD vs EMA 20')).toBeDefined();
  expect(screen.getByText(/on schedule \*\/5 \* \* \* \* \(Asia\/Kolkata\) · 1\/2 runs/)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  await vi.waitFor(() => { expect(verbs).toEqual(['pause']); });
});

it('shows which skill the assistant is following', async () => {
  server.use(http.post('/api/v1/agent/chat', () => sse([
    { type: 'start', messageId: 'a4' }, { type: 'start-step' },
    { type: 'tool-input-available', toolCallId: 's1', toolName: 'useSkill', input: { name: 'day-trader' } },
    { type: 'tool-output-available', toolCallId: 's1', output: { ok: true, data: { name: 'day-trader', version: 2, content: '# Day trader\nThe whole intraday workflow.' } } },
    { type: 'finish-step' }, { type: 'finish' },
  ])));
  render(<Providers><ChatPanel /></Providers>);
  await ask('trade RELIANCE intraday');
  const chip = await screen.findByText('Day trader');
  expect(chip.parentElement?.textContent).toBe('Using skillDay traderv2');
});

const pineDefinition = { ref: 'pine:0123456789ab@1', id: 'pine0123456789ab', version: 1, name: 'My EMA cross', shortName: 'EMAX', overlay: true,
  inputs: [{ id: 'len', title: 'Length', type: 'int', default: 9 }], plots: [{ id: 'ema', title: 'EMA', kind: 'line', color: 'blue', lineWidth: 1 }], levels: [] };
const pineCard = (check: unknown, patch: Record<string, unknown> = {}) => card({ action: { kind: 'add-pine', name: 'My EMA cross', source: 'plot(close)', check, scriptId: null }, ...patch });

it('shows the shared Pine script\'s inputs and plots, then saves and adds it only when applied (FR-IN-25, FR-AG-17)', async () => {
  useIndicatorStore.setState({ items: [] });
  const ok = { ok: true, definition: pineDefinition };
  let applies = 0;
  server.use(
    http.post('/api/v1/agent/chat', () => sse(proposal(pineCard(ok)))),
    http.get(`/api/v1/agent/actions/${cardId}`, () => HttpResponse.json(pineCard(ok))),
    http.post(`/api/v1/agent/actions/${cardId}/apply`, () => { applies += 1; return HttpResponse.json(pineCard(ok, { state: 'applied' })); }),
  );
  render(<Providers><ChatPanel /></Providers>);
  await ask('here is my script');
  expect(await screen.findByText('Save “My EMA cross” to My scripts and add it to the chart')).toBeDefined();
  expect(screen.getByText('Inputs: Length (9)')).toBeDefined();
  expect(screen.getByText('Plots: EMA')).toBeDefined();
  expect(applies).toBe(0);
  expect(useIndicatorStore.getState().items).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(await screen.findByText('applied')).toBeDefined();
  expect(applies).toBe(1);
  expect(useIndicatorStore.getState().items).toMatchObject([{ id: 'pine:0123456789ab@1', pine: { source: 'plot(close)' } }]);
});

it('shows the error line for a Pine script that does not compile and offers no Apply', async () => {
  const bad = { ok: false, error: 'Unexpected token', line: 3 };
  server.use(
    http.post('/api/v1/agent/chat', () => sse(proposal(pineCard(bad)))),
    http.get(`/api/v1/agent/actions/${cardId}`, () => HttpResponse.json(pineCard(bad))),
  );
  render(<Providers><ChatPanel /></Providers>);
  await ask('here is my script');
  expect((await screen.findByRole('alert')).textContent).toBe('Line 3: Unexpected token');
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Apply' }).disabled).toBe(true);
});
