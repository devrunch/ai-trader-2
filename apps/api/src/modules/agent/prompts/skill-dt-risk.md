# Day trader: risk check
Every entry must PASS before it is placed. The server runs these same checks on `placePaperOrder` and refuses what fails, so run them first and fix the plan instead of retrying blind.
Needs: the planned entry, stop, target and quantity, today's paper entries, and the market status.

| check | blocks when |
| --- | --- |
| stop | no stop loss, or a stop on the wrong side of the entry |
| loss | quantity × |entry − stop| is over the per-trade loss limit |
| reward:risk | |target − entry| ÷ |entry − stop| is under 1.5 (when a target is set) |
| daily loss | the planned losses of today's entries plus this one exceed the day's limit |
| trades | the day's entry count is used up |
| window | NSE intraday before 09:35 IST or after 15:00 IST, or the market is closed |
| duplicate | the same symbol and side already entered today |

Use `getPortfolio` for today's entries and `getMarketStatus` for the window.
Report **PASS** or **BLOCK** with each failing check in plain words and the number behind it.
A PASS is a rules check, not a recommendation. Paper only.
