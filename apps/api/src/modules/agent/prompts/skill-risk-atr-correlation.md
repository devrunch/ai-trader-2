# Risk sizing with ATR and correlation
Size every position from volatility and from what the account already holds, in any market.
Markets: all

1. `getPortfolio`: cash, open positions, and each position's currency (each currency is its own account; never convert).
2. `getIndicator` ATR(14) on the trade's interval and `getQuote` for the price. Stop distance = 1.5 × ATR unless the user or a chart level gives a better one (`proposeDrawing`).
3. Risk per trade: the user's figure, else 1% of that account's cash. Quantity = floor(risk ÷ stop distance), computed with `calculate`. For forex, the pip value is the quote currency; for futures, use the contract's multiplier from the instrument.
4. Correlation: for each open position, `getBars` daily (60 bars) for both and compare the sign of daily returns with `calculate`. Same direction on 70%+ of days counts as one bet: add the two risks together and keep the sum under 2% of the account.
5. If the sum is over the limit, cut this trade's size, not the stop.
6. State entry, stop, quantity, money at risk, % of account and which open position it overlaps. Paper only.
