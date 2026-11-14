# Trend check
Decide whether an instrument is trending, and which way, from data.
Needs: bars and indicators on the asked interval.

1. `getIndicator` EMA(20) and EMA(50) on the asked interval (default 15m), last 50 bars.
2. Up: the close is above both and EMA(20) is above EMA(50). Down: the mirror. Anything else is range.
3. Confirm with Supertrend(10, 3): its direction should agree.
4. `getIndicator` RSI(14): above 70 or below 30 means stretched; say so.
5. Report the verdict, the three readings with values, and the data status (live, delayed or closed, from `getMarketStatus` or `getQuote`).

Caveat: a trend read is a description of the past bars, not a forecast.
