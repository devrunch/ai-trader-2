# Momentum trading
Enter a confirmed directional move and exit when it decays.


1. `getIndicator` ADX(14) with `getBars`. Gate on ADX level, ADX slope, and recent return in ATR units (`calculate`), against thresholds set before testing. Gate fails means no trade; do not switch strategy on your own.
2. `getIndicator` RSI and MACD; quote 3 to 5 values each. These move together, so do not count them as independent confirmations. Compare volume with the same time of day on prior sessions.
3. Pick breakout or pullback entry before looking at results. Breakout: closed bar beyond the level plus an ATR buffer (see the breakout-trading skill). Pullback: see the pullback-trading skill.
4. Stop beyond the structure plus a slippage allowance; size from that distance.
5. Exit on one defined rule: for example MACD histogram shrinking while volume falls, or a close back under EMA(21). Test it with `runBacktest` after costs.
6. `getNews` for a catalyst; momentum on a news spike fades faster. Crash risk and thin liquidity mean smaller size.
7. ADX never sets position size. Sizing via the position-sizing skill, stop-loss required, and paper only.

Caveat: past results do not promise future profit; costs and small samples can erase an edge.
