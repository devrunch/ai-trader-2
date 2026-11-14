import type { ActionCardDto, AgentAction, DeskDecision, DeskRunDto } from '@aitrader/contracts';
import { describe, expect, it, vi } from 'vitest';
import { buildDeskTools } from './desk-tools';

const ctx = { userId: 'u1', conversationId: 'c1', turnId: 't1' };
const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined };
const card = (action: AgentAction): ActionCardDto => ({ id: '0b7f3c52-7c6e-4f0e-9a3b-1d2e3f4a5b6c', action, state: 'pending', reason: null, expiresAt: '2026-11-13T00:00:00.000Z', drawing: null });
const decision = (over: Partial<DeskDecision>): DeskDecision => ({ action: 'BUY', confidence: 0.7, entry: 1335.4, stopLoss: 1331.2, target: 1344, quantity: 100, skill: 'pullback-trading',
  summary: 'Pullback held the 50-bar average with news support.', vetoed: false, vetoReasons: [], ...over });
const run = (d: DeskDecision, status: DeskRunDto['status'] = 'done'): DeskRunDto => ({ id: '6f2b8a0e-4f7d-4a1b-9c0e-2d4f6a8b0c1d', symbol: 'NSE:RELIANCE', asOf: '2026-11-13T04:00:00.000Z', live: true,
  createdAt: '2026-11-13T04:00:00.000Z', status, decision: d, trail: { data: { asOf: '', lastClose: 1335, bars: 1, headlines: 0, events: 0 }, reports: {} as never, debate: [], proposal: null, riskReview: null, gate: { pass: true, blocks: [] } }, tokens: 1, calls: 1, error: null });

function setup(d: DeskDecision, status: DeskRunDto['status'] = 'done') {
  const desk = vi.fn().mockResolvedValue(run(d, status));
  const propose = vi.fn((_u: string, action: AgentAction) => Promise.resolve(card(action)));
  const [tool] = buildDeskTools({ run: desk, account: () => Promise.resolve({ initialCash: 1_000_000, currency: 'INR' }), propose, id: () => '6f2b8a0e-4f7d-4a1b-9c0e-2d4f6a8b0c1d' }, deps);
  return { tool, desk, propose };
}

describe('askDesk', () => {
  it('is named askDesk and takes a symbol, optional asOf and rounds', () => {
    const { tool } = setup(decision({}));
    expect(tool?.name).toBe('askDesk');
    expect(tool?.input.safeParse({ symbol: 'NSE:RELIANCE' }).success).toBe(true);
    expect(tool?.input.safeParse({ symbol: 'NSE:RELIANCE', asOf: '2026-11-10T09:30:00+05:30', rounds: 2 }).success).toBe(true);
    expect(tool?.input.safeParse({ symbol: 'NSE:RELIANCE', rounds: 9 }).success).toBe(false);
    expect(tool?.input.safeParse({}).success).toBe(false);
  });

  it('runs the desk and returns a BUY as a trade-plan card (levels, reward:risk, size, paper order)', async () => {
    const { tool, desk, propose } = setup(decision({}));
    const result = await tool?.call(ctx, { symbol: 'NSE:RELIANCE' });
    expect(desk).toHaveBeenCalledWith('u1', { symbol: 'NSE:RELIANCE', rounds: 1 }, expect.anything());
    expect(result).toMatchObject({ ok: true, data: { action: 'BUY', plan: { symbol: 'NSE:RELIANCE', side: 'buy', entry: 1335.4, stopLoss: 1331.2, targets: [1344], skill: 'pullback-trading',
      rewards: [{ price: 1344, rewardRisk: 2.05 }], sizing: { quantity: 1190 }, orderCard: { action: { kind: 'place-order', side: 'buy' } } } } });
    expect(propose).toHaveBeenCalledOnce();
  });

  it('returns a SELL as a sell plan', async () => {
    const { tool } = setup(decision({ action: 'SELL', entry: 1335.4, stopLoss: 1339.6, target: 1327 }));
    expect(await tool?.call(ctx, { symbol: 'NSE:RELIANCE' })).toMatchObject({ ok: true, data: { plan: { side: 'sell', targets: [1327] } } });
  });

  it('returns the reasons for a HOLD and no card', async () => {
    const { tool, propose } = setup(decision({ action: 'HOLD', entry: null, stopLoss: null, target: null, quantity: null, summary: 'No clear edge: trend flat, event risk at 19:00.' }));
    const result = await tool?.call(ctx, { symbol: 'NSE:RELIANCE' });
    expect(result).toMatchObject({ ok: true, data: { action: 'HOLD', plan: null, reasons: ['No clear edge: trend flat, event risk at 19:00.'] } });
    expect(propose).not.toHaveBeenCalled();
  });

  it('gives the veto reasons and no card when the risk check blocked a BUY', async () => {
    const { tool } = setup(decision({ vetoed: true, vetoReasons: ['Reward to risk is below 1.5'] }));
    expect(await tool?.call(ctx, { symbol: 'NSE:RELIANCE' })).toMatchObject({ ok: true, data: { plan: null, reasons: expect.arrayContaining(['Reward to risk is below 1.5']) as string[] } });
  });

  it('says plainly when the desk stopped before deciding', async () => {
    const { tool } = setup(decision({ action: 'HOLD' }), 'error');
    expect(await tool?.call(ctx, { symbol: 'NSE:RELIANCE' })).toMatchObject({ ok: true, data: { plan: null, stopped: true } });
  });
});
