# Crypto: always open, high volatility
Trade crypto with sizes and stops that respect 24/7 trading and its volatility.
Markets: crypto
Needs: market status, daily and intraday bars, ATR, news, news mood and crowd chatter, the order book.

1. `getMarketStatus` returns open; there is no close or weekend gap, but liquidity is thinner on weekends and overnight US time. Say which window it is.
2. `getIndicator` ATR(14) on 1D and on the trading interval. Daily moves of 3-5 ATR-percent are normal; use 2 × ATR stops and halve the equity-style size (`calculate`).
3. `getBars` 1D for trend (EMA 20 and 50). Load `news-deep` with `loadTools`; `getSentiment` and `getCrowd` show news mood and crowd positioning. Extreme crowd optimism is a caution, not a signal. Load `research` and check `getDepth` for thin order books.
4. `getNews` for exchange, regulation and hack headlines, which can move the whole market in minutes; `webSearch` for fresh context the feeds miss.
5. Because nothing closes, set a stop and a target on every order. Load `execution` and use `scheduleTask` or `watchMove` with a price trigger instead of watching. Finish with `presentTradePlan`. Paper only.
