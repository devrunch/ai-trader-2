import { describe, expect, it } from 'vitest';
import { clampRounds, finalDecision, gateProposal } from './desk-gate';

const cfg = { minRewardRisk: 1.5, maxRiskPct: 1, initialCash: 100_000 };
const buy = { action: 'BUY' as const, confidence: 0.7, entry: 100, stopLoss: 98, target: 106, skill: null, rationale: 'Breakout with volume.' };

describe('clampRounds', () => {
  it('keeps rounds within 1 and 2', () => {
    expect([clampRounds(NaN), clampRounds(0), clampRounds(1), clampRounds(1.9), clampRounds(2), clampRounds(7)]).toEqual([1, 1, 1, 1, 2, 2]);
  });
});

describe('gateProposal', () => {
  it('passes a valid buy and sizes the quantity from the risk budget', () => {
    expect(gateProposal(buy, cfg)).toEqual({ pass: true, blocks: [], quantity: 500 });
  });
  it('lets a hold pass with no quantity', () => {
    expect(gateProposal({ action: 'HOLD', entry: null, stopLoss: null, target: null }, cfg)).toEqual({ pass: true, blocks: [], quantity: null });
  });
  it('blocks a stop on the wrong side', () => {
    const g = gateProposal({ ...buy, stopLoss: 102 }, cfg);
    expect(g.pass).toBe(false);
    expect(g.blocks).toContain('stop must be below the entry for a buy');
  });
  it('blocks a sell with the stop below the entry', () => {
    expect(gateProposal({ action: 'SELL', entry: 100, stopLoss: 98, target: 94 }, cfg).blocks).toContain('stop must be above the entry for a sell');
  });
  it('blocks a reward to risk under the minimum', () => {
    const g = gateProposal({ ...buy, target: 102 }, cfg);
    expect(g.pass).toBe(false);
    expect(g.blocks).toEqual(['reward:risk 1.00 is under 1.5']);
  });
  it('blocks when the risk budget cannot buy one unit', () => {
    const g = gateProposal({ ...buy, stopLoss: 50, target: 200 }, { ...cfg, initialCash: 1000 });
    expect(g.blocks).toContain('risk budget too small for one unit');
    expect(g.quantity).toBeNull();
  });
  it('blocks a buy or sell with missing levels', () => {
    expect(gateProposal({ ...buy, target: null }, cfg)).toEqual({ pass: false, blocks: ['a trade needs an entry, a stop loss and a target'], quantity: null });
  });
});

describe('finalDecision', () => {
  const ok = { approve: true, reasons: [] };
  it('keeps the proposal with the gate quantity when approved', () => {
    const d = finalDecision(buy, gateProposal(buy, cfg), ok);
    expect(d).toMatchObject({ action: 'BUY', entry: 100, stopLoss: 98, target: 106, quantity: 500, vetoed: false, vetoReasons: [], summary: 'Breakout with volume.' });
  });
  it('turns a risk veto into a hold with every reason', () => {
    const d = finalDecision(buy, gateProposal(buy, cfg), { approve: false, reasons: ['earnings tomorrow'] });
    expect(d).toMatchObject({ action: 'HOLD', vetoed: true, vetoReasons: ['earnings tomorrow'], entry: null, stopLoss: null, target: null, quantity: null });
  });
  it('turns a gate failure into a hold carrying the gate blocks', () => {
    const bad = { ...buy, stopLoss: 102 };
    const d = finalDecision(bad, gateProposal(bad, cfg), ok);
    expect(d.action).toBe('HOLD');
    expect(d.vetoed).toBe(true);
    expect(d.vetoReasons).toEqual(['stop must be below the entry for a buy']);
  });
  it('treats a missing review as a veto', () => {
    const d = finalDecision(buy, gateProposal(buy, cfg), null);
    expect(d).toMatchObject({ action: 'HOLD', vetoed: true, vetoReasons: ['risk review unavailable'] });
  });
  it('keeps a hold proposal as a hold without a veto', () => {
    const hold = { ...buy, action: 'HOLD' as const, entry: null, stopLoss: null, target: null };
    expect(finalDecision(hold, gateProposal(hold, cfg), null)).toMatchObject({ action: 'HOLD', vetoed: false, vetoReasons: [], quantity: null });
  });
  it('cuts the summary to 900 characters', () => {
    const long = { ...buy, rationale: 'x'.repeat(2000) };
    expect(finalDecision(long, gateProposal(long, cfg), ok).summary).toHaveLength(900);
  });
});
