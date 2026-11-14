export interface BudgetLimits { maxRounds: number; maxMs: number; maxTokens: number }
export type BudgetVerdict = 'ok' | { exceeded: 'rounds' | 'time' | 'tokens' };

/** One agent turn's ceilings: model rounds, wall clock and tokens (FR-AG-3). Once exceeded, it stays exceeded. */
export class TurnBudget {
  private readonly startedAt: number;
  private rounds = 0;
  private tokens = 0;
  private verdict: BudgetVerdict = 'ok';

  constructor(private readonly limits: BudgetLimits, private readonly clock: () => number = Date.now) {
    this.startedAt = clock();
  }

  /** Records one model round; returns whether the turn may continue. */
  spend(usage: { tokens: number }): BudgetVerdict {
    if (this.verdict !== 'ok') return this.verdict;
    this.rounds++;
    this.tokens += usage.tokens;
    if (this.clock() - this.startedAt >= this.limits.maxMs) this.verdict = { exceeded: 'time' };
    else if (this.rounds > this.limits.maxRounds) this.verdict = { exceeded: 'rounds' };
    else if (this.tokens > this.limits.maxTokens) this.verdict = { exceeded: 'tokens' };
    return this.verdict;
  }

  /** Close enough to a limit that the next step must be the answer: one round left, or under a quarter of the time or 15% of the tokens. */
  nearlySpent(): boolean {
    const left = this.remaining();
    return left.rounds <= 1 || left.ms < this.limits.maxMs * 0.25 || left.tokens < this.limits.maxTokens * 0.15;
  }

  remaining(): { rounds: number; ms: number; tokens: number } {
    return {
      rounds: Math.max(0, this.limits.maxRounds - this.rounds),
      ms: Math.max(0, this.limits.maxMs - (this.clock() - this.startedAt)),
      tokens: Math.max(0, this.limits.maxTokens - this.tokens),
    };
  }
}
