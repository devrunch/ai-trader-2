import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { useIndicatorStore } from '../indicators';
import { Providers } from '../../app/providers';
import { ChatPanel } from './index';

const sse = (chunks: unknown[]) => new HttpResponse([...chunks.map(c => `data: ${JSON.stringify(c)}\n\n`), 'data: [DONE]\n\n'].join(''),
  { headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } });
const server = setupServer(
  http.get('/api/v1/agent/status', () => HttpResponse.json({ enabled: true, model: 'xai/grok-4' })),
  http.get('/api/v1/agent/threads', () => HttpResponse.json([])),
  http.get('/api/v1/agent/threads/:id', () => HttpResponse.json({ code: 'NOT_FOUND', message: 'Chat not found', requestId: 'r' }, { status: 404 })),
);
beforeAll(() => { server.listen(); });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); });

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

it('removes the matching indicator from the chart when a remove card is applied (FR-IN-24)', async () => {
  useIndicatorStore.setState({ items: [{ key: 'a', id: 'rsi', inputs: { length: 14 } }, { key: 'b', id: 'rsi', inputs: { length: 7 } }, { key: 'c', id: 'ema', inputs: {} }], presentation: {} });
  let current = card({ action: { kind: 'remove-indicator', indicatorId: 'rsi', match: { length: 14 } } });
  server.use(
    http.post('/api/v1/agent/chat', () => sse(proposal(current))),
    http.get(`/api/v1/agent/actions/${cardId}`, () => HttpResponse.json(current)),
    http.post(`/api/v1/agent/actions/${cardId}/apply`, () => { current = { ...current, state: 'applied' }; return HttpResponse.json(current); }),
  );
  render(<Providers><ChatPanel /></Providers>);
  await ask('Remove RSI 14');
  expect(await screen.findByText('Remove RSI (length 14) from the chart')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(await screen.findByText('applied')).toBeDefined();
  expect(useIndicatorStore.getState().items.map(i => i.key)).toEqual(['b', 'c']);
});

it('changes the settings of an indicator on the chart and changes nothing when it is not there (FR-IN-24)', async () => {
  useIndicatorStore.setState({ items: [{ key: 'a', id: 'rsi', inputs: { length: 14, source: 'close' } }], presentation: {} });
  let current = card({ action: { kind: 'set-indicator-inputs', indicatorId: 'rsi', match: {}, inputs: { length: 9 } } });
  server.use(
    http.post('/api/v1/agent/chat', () => sse(proposal(current))),
    http.get(`/api/v1/agent/actions/${cardId}`, () => HttpResponse.json(current)),
    http.post(`/api/v1/agent/actions/${cardId}/apply`, () => { current = { ...current, state: 'applied' }; return HttpResponse.json(current); }),
  );
  render(<Providers><ChatPanel /></Providers>);
  await ask('Make RSI 9');
  expect(await screen.findByText('Change RSI to length 9')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(await screen.findByText('applied')).toBeDefined();
  expect(useIndicatorStore.getState().items).toMatchObject([{ id: 'rsi', inputs: { length: 9, source: 'close' } }]);
  expect(useIndicatorStore.getState().updateMatching('macd', {}, { fast: 5 })).toBe(0);
});
