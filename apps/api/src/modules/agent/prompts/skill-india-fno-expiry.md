# India F&O expiry-day playbook
Handle weekly and monthly expiry days on NSE index and stock derivatives.
Markets: india
Needs: market status, order book depth, intraday bars. Options chains and open interest are not available.

1. `getMarketStatus` for `NSE:NIFTY1!`: derivatives trade until 15:40 IST, cash until 15:30. Check it is not a holiday and note an expiry moved by one.
2. Option chain, open interest and strike data are not available here. Say so plainly, and do not guess pinning or max-pain levels; work from price, depth and bars only.
3. `getDepth` for the contract: a wide spread or thin 5-level quantity on expiry day means skip or size down. Load `research` with `loadTools` first.
4. `getBars` 5 minute and `getIndicator` for VWAP and ATR(14): expiry days swing hard in the last hour. Use the opening range of the first 30 minutes as the reference.
5. `getNews` for index events that day. Avoid new positions after 14:30 IST unless the plan is the expiry itself; fills get erratic.
6. Cut size to half of the normal size (`calculate`) and set the stop before entry. Do not average down. To get a considered view on one contract, `askDesk`.
7. Stock futures near monthly expiry: check the rollover in the contract id and trade the next series after the last week. Finish a plan with `presentTradePlan`. Paper only.

Caveat: expiry-day moves are violent and fills slip; this is a read of price and depth, not of the options market.
