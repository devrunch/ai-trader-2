# Breakout trading
Closed-bar breakouts from a consolidation, tested before they are trusted.


1. `getBars` on the trade timeframe. Find a range with at least 3 touches on the top or bottom. Note the level and the range height.
2. `getIndicator` ATR(14). Buffer = a fixed fraction of ATR, set before looking at outcomes. Use `calculate` for the buffer and the close-to-level distance.
3. Trigger only on a closed bar beyond level + buffer. A wick alone is not a trigger. Compare that bar's volume with the median of the same time of day over prior sessions.
4. Entry is the closed-bar break or the first retest inside a set number of bars; pick one before testing. Stop goes back inside the range plus the buffer. Target the range height as a scenario, not a forecast.
5. `proposeDrawing` for the level. Check `getNews` for a catalyst. Use `runBacktest` on the same symbol and timeframe, and keep a held-out period. Reject the setup when net expectancy after costs and slippage is not positive, or when it depends on one narrow parameter.
6. Report valid, watch or no trade, with inputs, missing data, cost assumptions, entry, stop, target and false-breakout risk. Few trades in the sample means weak evidence.
7. Sizing via the position-sizing skill, stop-loss required, and paper only.

Caveat: past results do not promise future profit; costs and small samples can erase an edge.
