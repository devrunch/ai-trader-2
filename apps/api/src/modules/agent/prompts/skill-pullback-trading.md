# Pullback trading
Join an established trend on a retracement to a reference level.
Needs: bars on two timeframes, indicators, volume, a backtest on past data.

1. Run the trend check playbook on a higher timeframe. Skip when there is no trend. To find trending names across a list, load `screening` with `loadTools` and use `scanUniverse`.
2. `getIndicator` EMA(21) and EMA(50) on both timeframes. Slope % = (EMA50 now − EMA50 five bars ago) ÷ EMA50 five bars ago × 100, via `calculate`. Fix the slope threshold before testing.
3. `getBars` on the trade timeframe. Find the last impulse swing and measure the retracement as a percentage of it with `calculate`. Reference levels: EMA 21 or 50, a prior swing, a flipped support or resistance. Depth is a risk feature, not a law at 61.8%.
4. `getIndicator` RSI and MACD; quote the last 3 to 5 values, not one. Want momentum turning back with the trend, and volume lighter on the pullback than on resumption.
5. Enter only on a closed reversal bar at the level. Stop beyond the pullback extreme plus a small ATR buffer; target the prior swing high or low.
6. Load `chart` with `loadTools`, then `proposeDrawing` for the entry zone. Load `strategies` and `runBacktest` to check net expectancy after costs on a held-out period. Few samples means weak evidence.
7. Sizing via the position sizing playbook, stop-loss required, then `presentTradePlan`. Paper only.

Caveat: past results do not promise future profit; costs and small samples can erase an edge.
