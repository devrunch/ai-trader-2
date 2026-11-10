import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
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
