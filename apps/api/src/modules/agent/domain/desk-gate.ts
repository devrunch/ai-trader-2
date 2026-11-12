import type { DeskDecision, DeskProposal } from '@aitrader/contracts';

export interface GateInput { action: 'BUY' | 'SELL' | 'HOLD'; entry: number | null; stopLoss: number | null; target: number | null }
export interface GateConfig { minRewardRisk: number; maxRiskPct: number; initialCash: number }
export interface GateResult { pass: boolean; blocks: string[]; quantity: number | null }
export interface RiskReview { approve: boolean; reasons: string[] }

export const clampRounds = (n: number): 1 | 2 => (Number.isFinite(n) && n >= 2 ? 2 : 1);

/** Code-side check of the trader's levels; the size comes from the risk budget, never from the model. */
export function gateProposal(p: GateInput, cfg: GateConfig): GateResult {
  if (p.action === 'HOLD') return { pass: true, blocks: [], quantity: null };
  const { entry, stopLoss, target } = p;
  if (entry === null || stopLoss === null || target === null) return { pass: false, blocks: ['a trade needs an entry, a stop loss and a target'], quantity: null };
  const long = p.action === 'BUY';
  const blocks: string[] = [];
  const stopOk = long ? stopLoss < entry : stopLoss > entry;
  const targetOk = long ? target > entry : target < entry;
  if (!stopOk) blocks.push(long ? 'stop must be below the entry for a buy' : 'stop must be above the entry for a sell');
  if (!targetOk) blocks.push(long ? 'target must be above the entry for a buy' : 'target must be below the entry for a sell');
  let quantity: number | null = null;
  if (stopOk) {
    const risk = Math.abs(entry - stopLoss);
    if (targetOk) {
      const rr = Math.abs(target - entry) / risk;
      if (rr < cfg.minRewardRisk) blocks.push(`reward:risk ${rr.toFixed(2)} is under ${String(cfg.minRewardRisk)}`);
    }
    const units = Math.floor((cfg.initialCash * cfg.maxRiskPct / 100) / risk);
    if (units >= 1) quantity = units;
    else blocks.push('risk budget too small for one unit');
  }
  return blocks.length ? { pass: false, blocks, quantity: null } : { pass: true, blocks, quantity };
}

export function finalDecision(proposal: DeskProposal, gate: GateResult, review: RiskReview | null): DeskDecision {
  const summary = proposal.rationale.slice(0, 900);
  if (proposal.action === 'HOLD') {
    return { action: 'HOLD', confidence: proposal.confidence, entry: null, stopLoss: null, target: null, quantity: null, skill: proposal.skill, summary, vetoed: false, vetoReasons: [] };
  }
  const reviewReasons = review === null ? ['risk review unavailable'] : review.approve ? [] : review.reasons;
  const vetoed = !gate.pass || review === null || !review.approve;
  if (vetoed) {
    return { action: 'HOLD', confidence: proposal.confidence, entry: null, stopLoss: null, target: null, quantity: null, skill: proposal.skill, summary, vetoed: true,
      vetoReasons: [...gate.blocks, ...reviewReasons] };
  }
  return { action: proposal.action, confidence: proposal.confidence, entry: proposal.entry, stopLoss: proposal.stopLoss, target: proposal.target, quantity: gate.quantity,
    skill: proposal.skill, summary, vetoed: false, vetoReasons: [] };
}
