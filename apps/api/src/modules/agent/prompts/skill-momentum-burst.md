# Momentum burst
Stockbee-style 3-5 day swing: a sharp daily expansion out of a quiet base, scored by quality.

1. Check the market first with the trend-check skill on the benchmark index. If it is weak, mark the result watch-only.
2. `getBars` daily for the symbol, completed sessions only (drop today's unfinished bar before the close).
3.
   Trigger, any of these (`calculate`): close ÷ previous close ≥ 1.04 with volume above the previous day and above a liquidity floor; a wide-body day (close − open at least about 1% of price); today's range larger than each of the prior three ranges while the prior day was not already extended.
4.
   Quality: volume vs 20-bar average (higher is better); prior 5-10 bars tight and flat; close in the top 25% of the day's range; stop at the trigger-day low with risk under about 8% of entry.
5. Reject when the stock already rose 4% or more in each of the last 3 days, had a 4% breakdown recently, or closed near the day's low.
6. Grade A (all quality checks pass, risk small), B (one miss, watchlist or smaller size), or reject.
   Only A goes forward: `getIndicator` check for chart sanity, then the breakout-trade-plan skill.
   Exit ideas: sell into the 3-5 day move or on a close below the trigger-day low.
7. Small samples and trading costs matter; verify any rule with the backtest-review skill.
   Stop-loss required; sizing via the position-sizing skill; paper only.
