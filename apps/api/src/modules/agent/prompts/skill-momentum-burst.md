# Momentum burst
Stockbee-style 3-5 day swing: a sharp daily expansion out of a quiet base, scored by quality.
Needs: daily bars, indicators, the benchmark index, news.

1. Check the market first with the trend check playbook on the benchmark index. If it is weak, mark the result watch-only.
2. To find candidates across many symbols, load `screening` with `loadTools` and use `scanUniverse` (a big daily gain on above-average volume); never loop `getBars` over symbols. Then `getBars` daily for each finalist, completed sessions only (drop today's unfinished bar before the close).
3.
   Trigger, any of these (`calculate`): close ÷ previous close ≥ 1.04 with volume above the previous day and above a liquidity floor; a wide-body day (close − open at least about 1% of price); today's range larger than each of the prior three ranges while the prior day was not already extended.
4.
   Quality: volume vs 20-bar average (higher is better); prior 5-10 bars tight and flat; close in the top 25% of the day's range; stop at the trigger-day low with risk under about 8% of entry.
5. Reject when the stock already rose 4% or more in each of the last 3 days, had a 4% breakdown recently, or closed near the day's low. `getNews` for the cause: a one-off news spike fades faster.
6. Grade A (all quality checks pass, risk small), B (one miss, keep an eye on it or smaller size), or reject.
   Only A goes forward: `getIndicator` check for chart sanity, then the breakout trade plan playbook and `presentTradePlan`.
   Exit ideas: sell into the 3-5 day move or on a close below the trigger-day low.
7. Small samples and trading costs matter; test any rule with `runBacktest` (load `strategies` first) and the backtest review playbook.
   Stop-loss required; sizing via the position sizing playbook; paper only.

Caveat: past results do not promise future profit; costs and small samples can erase an edge.
