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
  state: 'pending', reason: null, expiresAt: '2026-11-10T10:15:00.000Z', ...patch });
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
  const open = card({ action: { kind: 'open-symbol', symbol: 'NSE:INFY', interval: '15' } });
  server.use(
    http.post('/api/v1/agent/chat', () => sse(proposal(open))),
    http.get(`/api/v1/agent/actions/${cardId}`, () => HttpResponse.json(open)),
    http.post(`/api/v1/agent/actions/${cardId}/apply`, () => HttpResponse.json({ ...open, state: 'applied' })),
  );
  render(<Providers><ChatPanel actions={{ openSymbol }} /></Providers>);
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
