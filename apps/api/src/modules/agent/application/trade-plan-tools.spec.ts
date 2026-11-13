import type { ActionCardDto, AgentAction } from '@aitrader/contracts';
import { describe, expect, it, vi } from 'vitest';
import { buildTradePlanTools } from './trade-plan-tools';

const ctx = { userId: 'u1', conversationId: 'c1', turnId: 't1' };
const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined };
const card = (action: AgentAction): ActionCardDto => ({ id: '0b7f3c52-7c6e-4f0e-9a3b-1d2e3f4a5b6c', action, state: 'pending', reason: null, expiresAt: '2026-11-13T00:00:00.000Z', drawing: null });

function setup(cash = 1_000_000) {
  const propose = vi.fn((_userId: string, action: AgentAction) => Promise.resolve(card(action)));
  const [tool] = buildTradePlanTools({ account: () => Promise.resolve({ initialCash: cash, currency: 'INR' }), propose, id: () => '6f2b8a0e-4f7d-4a1b-9c0e-2d4f6a8b0c1d' }, deps);
  return { tool, propose };
}
const input = { symbol: 'NSE:RELIANCE', interval: '5', side: 'buy', entry: 1335.4, stopLoss: 1331.2, targets: [1344], confidence: 0.65, rationale: 'Pullback held the EMA50 after a breakout.' };

describe('presentTradePlan', () => {
  it('returns the plan with reward:risk, a size at 0.5% risk and a paper order card to confirm', async () => {
    const { tool, propose } = setup();
    const result = await tool?.call(ctx, input);
    expect(result).toMatchObject({ ok: true, data: { rewards: [{ price: 1344, rewardRisk: 2.05 }], sizing: { quantity: 1190, riskAmount: 4998, currency: 'INR' },
      orderCard: { state: 'pending', action: { kind: 'place-order', side: 'buy', type: 'limit', product: 'MIS', quantity: 1190, limitPrice: 1335.4, stopLoss: 1331.2, target: 1344 } } } });
    expect(propose).toHaveBeenCalledOnce();
  });

  it('refuses levels that do not fit the side, with a reason the model can fix', async () => {
    const { tool, propose } = setup();
    const result = await tool?.call(ctx, { ...input, stopLoss: 1340 });
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).toContain('stop below the entry');
    expect(propose).not.toHaveBeenCalled();
  });

  it('shows the plan without an order when one unit already risks more than the budget', async () => {
    const { tool, propose } = setup(500);
    const result = await tool?.call(ctx, input);
    expect(result).toMatchObject({ ok: true, data: { sizing: null, orderCard: null } });
    expect(propose).not.toHaveBeenCalled();
  });
});
