# Opening range (NSE)
The first 15 minutes set a range; a later break of it is the signal.
Needs: intraday 5 minute bars, market status.

1. `getMarketStatus` for NSE; on a trading day after 09:30 IST, `getBars` 5m for the instrument and take the 09:15 to 09:30 bars.
2. Opening range high = the highest high, low = the lowest low. Compute the width with `calculate`.
3. Long above the high, short below the low; stop at the opposite side or the midpoint for tighter risk. Confirm with volume from `getBars` and a quick `getNews` check for a catalyst.
4. No entries after 14:30 IST; intraday (MIS) positions are squared off automatically.
5. Before 09:30 or on a holiday, say the range is not formed yet.
6. Finish with `presentTradePlan` using the range levels; the server works out reward:risk and size. Paper only.

Caveat: false breaks are common on quiet days; a small range can mean a tiny stop and a big size, so check the sizing.
