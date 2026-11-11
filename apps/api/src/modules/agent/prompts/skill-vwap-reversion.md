# VWAP reversion
Intraday mean reversion around VWAP; only in a range, never against a strong trend.

1. Run the trend-check skill first. Skip when the trend is strong.
2. `getIndicator` VWAP on 5m. Distance = (close − VWAP) ÷ VWAP × 100, using `calculate`.
3. Consider a fade only when the distance is beyond ±1% and RSI(14) is stretched the same way.
4. Target VWAP, stop beyond the day's extreme. Size with the position-sizing skill.
