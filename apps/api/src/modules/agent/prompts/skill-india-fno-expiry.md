# India F&O expiry-day playbook
Handle weekly and monthly expiry days on NSE index and stock derivatives.
Markets: india
Needs: market status, option chain and open interest (`options` group), order book depth, intraday bars.

1. `getMarketStatus` for `NSE:NIFTY1!`: derivatives trade until 15:40 IST, cash until 15:30. Check it is not a holiday and note an expiry moved by one.
2. `loadTools` with `options`, then `getOptionsSummary` for the index or stock (nearest expiry by default): put-call ratio by open interest, max pain, and the biggest open-interest build-ups. Max pain is a magnet candidate on expiry day, not a forecast; the put-call ratio says where writers sit, not direction.
   `getOptionChain` (8 strikes) for the at-the-money strikes: call and put open interest and its change, implied volatility, last price. Heavy call open interest above spot and put open interest below mark the likely range; a build-up that is shrinking or has no baseline (`oiChange` null) is unconfirmed.
   If the tool says the chain is unavailable or stale (`fetchedAt` old), say so and fall back to price, depth and bars.
3. `getDepth` for the contract: a wide spread or thin 5-level quantity on expiry day means skip or size down. Load `research` with `loadTools` first.
4. `getBars` 5 minute and `getIndicator` for VWAP and ATR(14): expiry days swing hard in the last hour. Use the opening range of the first 30 minutes as the reference.
5. `getNews` for index events that day. Avoid new positions after 14:30 IST unless the plan is the expiry itself; fills get erratic.
6. Cut size to half of the normal size (`calculate`) and set the stop before entry. Do not average down. To get a considered view on one contract, `askDesk`.
7. Stock futures near monthly expiry: check the rollover in the contract id and trade the next series after the last week. Finish a plan with `presentTradePlan`. Paper only.

Caveat: expiry-day moves are violent and fills slip. Implied volatility is computed from the last traded price, which can be stale for far strikes.
