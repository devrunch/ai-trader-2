# Opening range (NSE)
The first 15 minutes set a range; a later break of it is the signal.

1. On a trading day after 09:30 IST, `getBars` 5m for the instrument and take the 09:15 to 09:30 bars.
2. Opening range high = the highest high, low = the lowest low. Compute the width with `calculate`.
3. Long above the high, short below the low; stop at the opposite side or the midpoint for tighter risk.
4. No entries after 14:30 IST; intraday (MIS) positions are squared off automatically.
5. Before 09:30 or on a holiday, say the range is not formed yet.
