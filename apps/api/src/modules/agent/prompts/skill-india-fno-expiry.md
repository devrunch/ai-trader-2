# India F&O expiry-day playbook
Handle weekly and monthly expiry days on NSE index and stock derivatives.
Markets: india

1. `getMarketStatus` for `NSE:NIFTY1!`: derivatives trade until 15:40 IST, cash until 15:30. Check it is not a holiday and note an expiry moved by one.
2. `getDepth` for the contract: a wide spread or thin 5-level quantity on expiry day means skip or size down.
3. `getBars` 5 minute and `getIndicator` for VWAP and ATR(14): expiry days swing hard in the last hour. Use the opening range of the first 30 minutes as the reference.
4. Avoid new positions after 14:30 IST unless the plan is the expiry itself; expiring option premiums decay fast and gaps in fill are common.
5. Cut size to half of the normal size (`calculate`) and set the stop before entry. Do not average down.
6. Stock futures near monthly expiry: check the rollover in the contract id; trade the next series after the last week. Paper only.
