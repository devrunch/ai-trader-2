import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { ChatView } from '@aitrader/contracts';
import { Providers } from '../../app/providers';
import { ChatActionsContext } from './chat-actions';
import { ChatAskContext, ChatViewCard, CustomViewFrame } from './chat-view';

const posted: unknown[] = [];
const server = setupServer(
  http.post('*/v1/agent/tasks/alerts', async ({ request }) => { posted.push(await request.json()); return HttpResponse.json({}, { status: 201 }); }),
  http.get('*/v1/bars', () => HttpResponse.json({ symbol: 'NSE:TCS', interval: '1D', bars: [] })),
);
beforeAll(() => { server.listen(); });
afterEach(() => { cleanup(); server.resetHandlers(); posted.length = 0; });
afterAll(() => { server.close(); });

const view: ChatView = { title: 'TCS vs INFY', blocks: [
  { kind: 'figures', items: [{ label: 'Entry', value: '3,420', tone: 'up' }, { label: 'Stop', value: '3,380', tone: 'down' }] },
  { kind: 'compare', symbols: ['NSE:TCS', 'NSE:INFY'], metrics: [{ label: 'P/E', values: ['28.1', '24.6'] }] },
  { kind: 'actions', buttons: [
    { label: 'Open TCS', action: { type: 'open-symbol', symbol: 'NSE:TCS' } },
    { label: 'Alert above 3,450', action: { type: 'set-alert', symbol: 'NSE:TCS', op: 'above', value: 3450 } },
    { label: 'Place it', action: { type: 'ask', text: 'Place the TCS trade' } },
  ] },
] };

function renderWith(node: React.ReactNode) {
  const actions = { openSymbol: vi.fn(), addDrawing: vi.fn() };
  const ask = vi.fn();
  render(<Providers><ChatActionsContext value={actions}><ChatAskContext value={ask}>{node}</ChatAskContext></ChatActionsContext></Providers>);
  return { actions, ask };
}

it('draws the figures and the comparison and runs each kind of button', async () => {
  const { actions, ask } = renderWith(<ChatViewCard view={view} />);
  expect(screen.getByText('3,420')).toBeDefined();
  expect(screen.getByText('INFY')).toBeDefined();
  expect(screen.getByText('24.6')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Open TCS' }));
  expect(actions.openSymbol).toHaveBeenCalledWith('NSE:TCS', undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Place it' }));
  expect(ask).toHaveBeenCalledWith('Place the TCS trade');
  fireEvent.click(screen.getByRole('button', { name: 'Alert above 3,450' }));
  await waitFor(() => { expect(posted).toEqual([{ trigger: { kind: 'price', symbol: 'NSE:TCS', op: 'above', value: 3450 }, repeat: false, note: 'Set from a reply' }]); });
});

it('runs a custom view sandboxed and only acts on a valid request the user confirms', () => {
  const { actions } = renderWith(<CustomViewFrame view={{ title: 'Heatmap', html: '<div id="root">heatmap</div>', data: { a: 1 }, height: 300 }} />);
  const frame = screen.getByTitle<HTMLIFrameElement>('Heatmap');
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  expect(frame.getAttribute('srcdoc')).toContain('window.VIEW_DATA={"a":1}');
  const send = (data: unknown, source: MessageEventSource | null = frame.contentWindow) => { act(() => { window.dispatchEvent(new MessageEvent('message', { data, source })); }); };
  send({ source: 'ai-trader-view', action: { type: 'open-symbol', symbol: 'NSE:TCS' } }, null);
  send({ source: 'ai-trader-view', action: { type: 'place-order', symbol: 'NSE:TCS' } });
  expect(screen.queryByRole('alert')).toBeNull();
  send({ source: 'ai-trader-view', action: { type: 'open-symbol', symbol: 'NSE:TCS' } });
  expect(screen.getByRole('alert').textContent).toContain('open TCS');
  expect(actions.openSymbol).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Do it' }));
  expect(actions.openSymbol).toHaveBeenCalledWith('NSE:TCS', undefined);
});
