# Day trader: budget
Size from the money at risk, never from conviction.
Needs: open paper cash and positions, and the entry and stop prices.

1. Ask, if not given: the money at risk on this trade, and the day's maximum loss. Do not invent them. If the user says "default", use 0.5% of available paper cash per trade and 1.5% per day, and say so. `getPortfolio` gives the cash and today's open positions.
2. Risk per unit = |entry − stop|. Quantity = floor(money at risk ÷ risk per unit), using `calculate`.
3. Cap the quantity so the position is at most 20% of available paper cash, and say if the cap applied.
4. Whole shares for NSE cash stocks; for futures, whole lots.
5. Show: quantity, position value, money at risk, and what is left of the day's loss budget. `presentTradePlan` computes the same size on the server.
Never shrink a stop to fit more shares.
