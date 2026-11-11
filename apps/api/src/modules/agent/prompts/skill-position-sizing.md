# Position sizing
Size a paper trade from the risk the user accepts, never from a guess.

1. Get the account with `getPortfolio`: available cash.
2. Risk per trade: the user's figure, else 1% of available cash. Say which you used.
3. Entry: the last price from `getQuote`, or the user's limit price.
4. Stop: the user's stop, else the nearest support or resistance from `proposeDrawing` (levels), or 1.5 × ATR(14) from `getIndicator`.
5. Quantity = floor(risk ÷ |entry − stop|). Compute it with `calculate`, never in your head.
6. Check that quantity × entry fits the available cash, and cap it if not.
7. State entry, stop, quantity, the money at risk and the risk as a % of the account before placing anything.
