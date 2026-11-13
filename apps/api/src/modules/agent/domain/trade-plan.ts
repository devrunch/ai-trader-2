import type { TradePlanInput } from '@aitrader/contracts';

const PLAN_RISK_PCT = 0.5;

export type PlanGeometry = { ok: true; riskPerUnit: number; rewards: Array<{ price: number; rewardRisk: number }> } | { ok: false; reason: string };

/** The levels must make sense for the side: a buy has its stop below the entry and every target above it, in order; a sell the reverse. */
export function planGeometry(plan: Pick<TradePlanInput, 'side' | 'entry' | 'stopLoss' | 'targets'>): PlanGeometry {
  const { side, entry, stopLoss, targets } = plan;
  const buy = side === 'buy';
  if (buy ? stopLoss >= entry : stopLoss <= entry) return { ok: false, reason: `a ${side} needs its stop ${buy ? 'below' : 'above'} the entry` };
  const wrong = targets.find(t => (buy ? t <= entry : t >= entry));
  if (wrong !== undefined) return { ok: false, reason: `target ${String(wrong)} is on the wrong side of the entry for a ${side}` };
  for (let i = 1; i < targets.length; i++) {
    const prev = targets[i - 1] ?? entry; const cur = targets[i] ?? entry;
    if (buy ? cur <= prev : cur >= prev) return { ok: false, reason: 'targets must move away from the entry in order' };
  }
  const riskPerUnit = Math.abs(entry - stopLoss);
  return { ok: true, riskPerUnit, rewards: targets.map(price => ({ price, rewardRisk: Math.round((Math.abs(price - entry) / riskPerUnit) * 100) / 100 })) };
}

/** Whole units that keep the loss at the stop within `riskPct` of capital; null when not even one unit fits. */
export function planSize(capital: number, riskPerUnit: number, riskPct = PLAN_RISK_PCT): { quantity: number; riskAmount: number; riskPct: number } | null {
  const quantity = Math.floor((capital * riskPct) / 100 / riskPerUnit);
  if (quantity < 1) return null;
  return { quantity, riskAmount: Math.round(quantity * riskPerUnit * 100) / 100, riskPct };
}
