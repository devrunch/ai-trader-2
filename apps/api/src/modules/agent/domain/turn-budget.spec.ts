import { describe, expect, it } from 'vitest';
import { TurnBudget } from './turn-budget';

describe('TurnBudget (FR-AG-3)', () => {
  it('allows rounds until the round ceiling, plus one for the answer', () => {
    const budget = new TurnBudget({ maxRounds: 2, maxMs: 60_000, maxTokens: 10_000 }, () => 0);
    expect(budget.spend({ tokens: 100 })).toBe('ok');
    expect(budget.spend({ tokens: 100 })).toBe('ok');
    expect(budget.spend({ tokens: 100 })).toBe('ok');
    expect(budget.spend({ tokens: 100 })).toEqual({ exceeded: 'rounds' });
  });

  it('stops on wall clock and on tokens', () => {
    let now = 0;
    const timed = new TurnBudget({ maxRounds: 10, maxMs: 1_000, maxTokens: 10_000 }, () => now);
    now = 1_000;
    expect(timed.spend({ tokens: 1 })).toEqual({ exceeded: 'time' });
    const tokens = new TurnBudget({ maxRounds: 10, maxMs: 60_000, maxTokens: 500 }, () => 0);
    expect(tokens.spend({ tokens: 400 })).toBe('ok');
    expect(tokens.spend({ tokens: 200 })).toEqual({ exceeded: 'tokens' });
  });

  it('a spent budget stays spent', () => {
    const budget = new TurnBudget({ maxRounds: 1, maxMs: 60_000, maxTokens: 10_000 }, () => 0);
    budget.spend({ tokens: 1 });
    budget.spend({ tokens: 1 });
    expect(budget.spend({ tokens: 0 })).toEqual({ exceeded: 'rounds' });
    expect(budget.remaining()).toEqual({ rounds: 0, ms: 60_000, tokens: 9_998 });
  });
  it('is nearly spent with two rounds left or a small share of time or tokens', () => {
    let now = 0;
    const budget = new TurnBudget({ maxRounds: 3, maxMs: 100_000, maxTokens: 10_000 }, () => now);
    expect(budget.nearlySpent()).toBe(false);
    budget.spend({ tokens: 8_600 });
    expect(budget.nearlySpent()).toBe(true);
    const big = new TurnBudget({ maxRounds: 10, maxMs: 100_000, maxTokens: 100_000 }, () => now);
    big.spend({ tokens: 20_000 }); expect(big.nearlySpent()).toBe(false);
    big.spend({ tokens: 25_000 }); expect(big.nearlySpent()).toBe(true);
    const timed = new TurnBudget({ maxRounds: 10, maxMs: 100_000, maxTokens: 10_000 }, () => now);
    now = 80_000;
    expect(timed.nearlySpent()).toBe(true);
  });
});
