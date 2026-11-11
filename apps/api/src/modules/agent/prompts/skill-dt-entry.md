# Day trader: entry timer
One moment: the completed bar that confirms the setup.

- **Opening range.** The high and low of the first 15 minutes (NSE: the 09:15, 09:20 and 09:25 five-minute bars). The level to beat is the range high (long) or low (short). Read them with `getBars` on 5m.
- **Level.** Or a level from the scan, or one the user gives.
- **Trigger.** The first COMPLETED bar after the range that CLOSES beyond the level. A wick through the level is not a trigger.
- **Volume check (optional).** The trigger bar's volume at least 1.5 times the average of the previous 20 bars, using `calculate`.
- **Window.** No entries before 09:35 IST or after 15:00 IST on NSE (intraday positions are squared off near 15:20).

Report one of: **waiting** (the level and how far away, in points and %), **triggered** (the bar's time in IST and its close), **expired** (past 15:00), or **not open yet**.
If waiting, offer to `scheduleTask` a price condition at the level so the check runs on its own.
