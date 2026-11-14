# VCP setup check
Minervini-style volatility contraction: a Stage 2 uptrend base whose pullbacks get shallower into a pivot.
Needs: daily bars for about a year, moving averages, the benchmark index, volume.

1. `getBars` daily, about 1 year, for the symbol and for the benchmark index. Run the trend check playbook. To find candidates across a list, load `screening` with `loadTools` and use `scanUniverse` (above the 150 and 200 day averages, near the 52-week high) instead of looping `getBars`.
   Stage 2 needs close above SMA50, SMA150 and SMA200 (`getIndicator`), SMA150 above SMA200, SMA200 rising for 22+ sessions, close 25%+ above the 52-week low and within 25% of the 52-week high.
   Pass at least 6 of 7 checks; the 7th is relative strength: 6-month return beats the benchmark (`calculate`).
2. Mark the swing highs and lows of the base. Contraction depth = (high − low) ÷ high × 100 using `calculate`.
   First pullback roughly 8-35%; each later one at least 25% tighter than the one before (ratio 0.75 or less).
   Need 2 or more contractions; 3-4 is better, the last often under 5%.
3. Pivot = high of the last contraction. Volume dry-up = average volume of the last 10 bars ÷ 50-bar average volume: under 0.5 strong, over 0.7 weak.
4. A breakout counts only on a close above the pivot with volume at least 1.5x the 50-bar average.
   Skip a wide, loose last contraction (over 15%) or a price over 50% above SMA200.
5. Report each check with its number, the pivot, and the stop (1-2% under the last contraction low).
   Load `chart` and `proposeDrawing` the pivot and stop levels. Risk to stop above 8% means skip. Setups are patterns, not guarantees.
6. Plan the trade with the breakout trade plan playbook and `presentTradePlan`. Stop-loss required; sizing via the position sizing playbook; paper only.
