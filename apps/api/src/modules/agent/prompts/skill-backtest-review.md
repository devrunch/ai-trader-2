# Backtest review
Judge a backtest by how little it breaks under pessimistic assumptions, not by its headline profit.

1. State the edge in one sentence with exact entry, exit, stop and universe. If it needs judgement calls, rewrite the rules until it does not.
2. `runBacktest` over at least 5 years (10 is better), spanning bull, bear and high and low volatility periods.
   Include costs: brokerage, STT, exchange charges, and slippage.
3. Sample size: under 30 trades is not evidence, 100+ is preferred, 200+ gives confidence. Say so plainly.
4. Stress it with further `runBacktest` runs: stop at 50%, 75%, 125%, 150% of baseline; target at 80-120%; slippage at 1.5-2x.
   Look for a plateau of similar results, not one narrow peak.
5. Time robustness: results per year and per regime. Positive expectancy in most years, with no reliance on one or two exceptional periods.
6. Out-of-sample: fit on the early years, test on the later ones with `runBacktest`.
   Out-of-sample under 50% of in-sample, or parameters that keep changing, means overfit.
7. Check bias: look-ahead (using the bar's close before it formed), survivorship (only current constituents), and over-tuning.
   Use `calculate` for expectancy = win rate × average win − loss rate × average loss.
8. Verdict: deploy to paper only, refine, or abandon, with the numbers behind it. A backtest is not a promise of future returns.
   Paper only; sizing via the position-sizing skill.
