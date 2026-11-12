import { describe, expect, it } from 'vitest';
import { planGeometry, planSize } from './trade-plan';

describe('trade plan geometry', () => {
  it('computes risk per unit and reward:risk per target for a buy', () => {
    expect(planGeometry({ side: 'buy', entry: 1335.4, stopLoss: 1331.2, targets: [1344, 1350] }))
      .toEqual({ ok: true, riskPerUnit: expect.closeTo(4.2, 6) as number, rewards: [{ price: 1344, rewardRisk: 2.05 }, { price: 1350, rewardRisk: 3.48 }] });
  });
  it('mirrors the rules for a sell', () => {
    const g = planGeometry({ side: 'sell', entry: 100, stopLoss: 102, targets: [96, 94] });
    expect(g).toMatchObject({ ok: true, riskPerUnit: 2, rewards: [{ price: 96, rewardRisk: 2 }, { price: 94, rewardRisk: 3 }] });
  });
  it.each([
    [{ side: 'buy' as const, entry: 100, stopLoss: 101, targets: [105] }, 'stop below'],
    [{ side: 'sell' as const, entry: 100, stopLoss: 99, targets: [95] }, 'stop above'],
    [{ side: 'buy' as const, entry: 100, stopLoss: 98, targets: [99] }, 'wrong side'],
    [{ side: 'buy' as const, entry: 100, stopLoss: 98, targets: [106, 104] }, 'in order'],
  ])('refuses levels that do not fit the side (%#)', (plan, reason) => {
    const g = planGeometry(plan);
    expect(g.ok).toBe(false);
    expect(g.ok ? '' : g.reason).toContain(reason);
  });
});

describe('trade plan size', () => {
  it('sizes to 0.5% of capital at the stop', () => {
    expect(planSize(1_000_000, 4.2)).toEqual({ quantity: 1190, riskAmount: 4998, riskPct: 0.5 });
  });
  it('is null when one unit already risks more than the budget', () => {
    expect(planSize(10_000, 60)).toBeNull();
  });
});
