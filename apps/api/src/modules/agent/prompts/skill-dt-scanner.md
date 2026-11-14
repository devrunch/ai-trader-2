# Day trader: scanner
Find intraday candidates with data, not hunches.
Needs: daily bars and ATR for each candidate. Company results dates are not available.

1. Candidates: the symbols the user names; else load `screening` with `loadTools` and use `getWatchlist`, or `searchInstruments` with a broad query, for instruments that trade now.
2. To rank many symbols at once use `scanUniverse` with the rule below; never loop `getBars` symbol by symbol. For one or two names, `getBars` on 1D for the last 30 days and `getIndicator` ATR(14) on 1D.
3. Keep a candidate when: the latest close is within 2% of its 20-day high (breakout watch) or 20-day low (breakdown watch), and ATR(14) is at least 1% of price (it moves enough to pay costs). Compute both with `calculate`.
4. Rank by distance to the 20-day level, nearest first. Show at most five, each with the level, the distance in % and ATR as % of price.
5. Say what the scan cannot see: news, results dates, liquidity. That is the next step.
