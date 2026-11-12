import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { TradePlanDto } from '@aitrader/contracts';
import { Providers } from '../../app/providers';
import { ChatActionsContext } from './chat-actions';
import { TradePlanCard } from './trade-plan-card';

vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: unknown }) => children }));

const posted: unknown[] = [];
const server = setupServer(http.post('*/v1/agent/tasks/alerts', async ({ request }) => { posted.push(await request.json()); return HttpResponse.json({}, { status: 201 }); }));
beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
afterEach(() => { cleanup(); server.resetHandlers(); posted.length = 0; });
afterAll(() => { server.close(); });

const plan: TradePlanDto = {
  id: '6f2b8a0e-4f7d-4a1b-9c0e-2d4f6a8b0c1d', symbol: 'NSE:RELIANCE', interval: '5', side: 'buy', entry: 1335.4, stopLoss: 1331.2, targets: [1344],
  confidence: 0.65, horizon: 'intraday', rationale: 'Pullback held the 5m EMA50 after a breakout on heavy volume.', invalidation: 'A close below 1,331',
  skill: 'skill-pullback-trading', riskPerUnit: 4.2, rewards: [{ price: 1344, rewardRisk: 2.05 }],
  sizing: { quantity: 1190, riskAmount: 4998, riskPct: 0.5, currency: 'INR' }, orderCard: null,
};

function renderCard(actions = { openSymbol: vi.fn(), addDrawing: vi.fn() }) {
  render(<Providers><ChatActionsContext.Provider value={actions}><TradePlanCard plan={plan} /></ChatActionsContext.Provider></Providers>);
  return actions;
}

it('shows the levels, reward:risk, size and money at risk', () => {
  renderCard();
  expect(screen.getByRole('article', { name: 'Trade plan: buy NSE:RELIANCE' })).toBeTruthy();
  expect(screen.getByText('2.05R')).toBeTruthy();
  expect(screen.getByText('1,190')).toBeTruthy();
  expect(screen.getByText(/Loses ₹4,998 at the stop, 0.5% of the paper account/)).toBeTruthy();
  expect(screen.getByText(/A close below 1,331/)).toBeTruthy();
});

it('draws entry, stop and target lines on the chart', async () => {
  const actions = renderCard();
  fireEvent.click(screen.getByRole('button', { name: 'Draw levels' }));
  await waitFor(() => { expect(actions.addDrawing).toHaveBeenCalled(); });
  const [id, drawing] = actions.addDrawing.mock.calls[0] as [string, { segments: Array<{ label: string }> }];
  expect(id).toBe(plan.id);
  expect(drawing.segments.map(s => s.label)).toEqual(['Entry 1,335.4', 'Stop 1,331.2', 'T1 1,344']);
});

it('sets a price alert at the stop and at target 1', async () => {
  renderCard();
  fireEvent.click(screen.getByRole('button', { name: 'Alert at stop and T1' }));
  await waitFor(() => { expect(screen.getByRole('button', { name: 'Alerts set' })).toBeTruthy(); });
  expect(posted).toEqual([
    expect.objectContaining({ trigger: { kind: 'price', symbol: 'NSE:RELIANCE', op: 'below', value: 1331.2 } }),
    expect.objectContaining({ trigger: { kind: 'price', symbol: 'NSE:RELIANCE', op: 'above', value: 1344 } }),
  ]);
});
