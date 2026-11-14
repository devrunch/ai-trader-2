# VWAP reversion
Intraday mean reversion around VWAP; only in a range, never against a strong trend.
Needs: intraday 5 minute bars, VWAP and RSI.

1. Run the trend check playbook first. Skip when the trend is strong.
2. `getIndicator` VWAP on 5m. Distance = (close − VWAP) ÷ VWAP × 100, using `calculate`.
3. Consider a fade only when the distance is beyond ±1% and RSI(14) is stretched the same way. `getNews` first: a fade into a news-driven move often fails.
4. Target VWAP, stop beyond the day's extreme. Size with the position sizing playbook, then show the plan with `presentTradePlan`. Paper only.

Caveat: reversion fails on trend days; take the stop, do not average in.
