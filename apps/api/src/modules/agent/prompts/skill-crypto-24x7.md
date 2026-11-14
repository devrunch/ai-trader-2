# Crypto: always open, high volatility
Trade crypto with sizes and stops that respect 24/7 trading and its volatility.
Markets: crypto

1. `getMarketStatus` returns open; there is no close or weekend gap, but liquidity is thinner on weekends and overnight US time. Say which window it is.
2. `getIndicator` ATR(14) on 1D and on the trading interval. Daily moves of 3-5 ATR-percent are normal; use 2 × ATR stops and halve the equity-style size (`calculate`).
3. `getBars` 1D for trend (EMA 20 and 50) and `getSentiment` plus `getCrowd` for crowd positioning. Extreme crowd optimism is a caution, not a signal.
4. `getNews` for exchange, regulation and hack headlines, which can move the whole market in minutes.
5. Because nothing closes, set a stop and a target on every order, and use `scheduleTask` with a price trigger instead of watching. Paper only.
