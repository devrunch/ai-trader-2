# Idea screen
Surface a short list of candidates from a watchlist or sector; a screen gives candidates, not conclusions.


1. Ask or infer the style: momentum, breakout, pullback or oversold bounce, and long or short. Use `getWatchlist` or `searchInstruments` for the universe.
2. For each name `getBars` daily, `getIndicator` for RSI(14) and moving averages. Use `calculate` for 1-month and 3-month return, distance from the 52-week high, and volume vs the 20-day average.
3. Momentum: above the 50-day average, near the 52-week high, rising volume. Pullback: uptrend intact, RSI(14) cooled. Oversold bounce: RSI(14) stretched and price at support. Mirror these for shorts.
4. Drop names with thin volume or a results date inside the next few sessions (`getNews`, `getEconomicCalendar`). Run the trend-check skill on the survivors.
5. Present at most 5 ideas, ranked: symbol, setup, key level, trigger, invalidation, and the one risk that would make it wrong. Say which criteria each passed. Run the risk-reward skill on each.
6. Past screen hits are a small sample and ignore costs; say so.
7. Do not chase a name already extended.
8. Sizing via the position-sizing skill, stop-loss required, and paper only.
