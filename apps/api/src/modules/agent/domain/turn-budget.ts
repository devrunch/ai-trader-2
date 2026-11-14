export interface BudgetLimits { maxRounds: number; maxMs: number; maxTokens: number }
export type BudgetVerdict = 'ok' | { exceeded: 'rounds' | 'time' | 'tokens' };

/** One agent turn's ceilings: model rounds, wall clock and tokens (FR-AG-3). Once exceeded, it stays exceeded. */
export class TurnBudget {
  private readonly startedAt: number;
  private rounds = 0;
  private tokens = 0;
  private lastStep = 0;
  private verdict: BudgetVerdict = 'ok';

  constructor(private readonly limits: BudgetLimits, private readonly clock: () => number = Date.now) {
    this.startedAt = clock();
  }

  /** Records one model round; returns whether the turn may continue. */
  spend(usage: { tokens: number }): BudgetVerdict {
    if (this.verdict !== 'ok') return this.verdict;
    this.rounds++;
    this.tokens += usage.tokens;
    this.lastStep = usage.tokens;
    if (this.clock() - this.startedAt >= this.limits.maxMs) this.verdict = { exceeded: 'time' };
    // One round of grace past the limit: the answer step that follows the last tool round must not be cut off.
    else if (this.rounds > this.limits.maxRounds + 1) this.verdict = { exceeded: 'rounds' };
    else if (this.tokens > this.limits.maxTokens) this.verdict = { exceeded: 'tokens' };
    return this.verdict;
  }

  /**
   * Close enough to a limit that the next step must be the answer: two rounds left, under a quarter of the time, or fewer tokens left than 15% of the
   * budget or two and a half times the last step. Each step re-reads the whole conversation, and the runner may ask before the last step is counted.
   */
  nearlySpent(): boolean {
    const left = this.remaining();
    return left.rounds <= 2 || left.ms < this.limits.maxMs * 0.25 || left.tokens < Math.max(this.limits.maxTokens * 0.15, this.lastStep * 2.5);
  }

  remaining(): { rounds: number; ms: number; tokens: number } {
    return {
      rounds: Math.max(0, this.limits.maxRounds - this.rounds),
      ms: Math.max(0, this.limits.maxMs - (this.clock() - this.startedAt)),
      tokens: Math.max(0, this.limits.maxTokens - this.tokens),
    };
  }
}
