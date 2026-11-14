# Idea screen
Surface a short list of candidates from a watchlist or sector; a screen gives candidates, not conclusions.
Needs: daily bars for many symbols, the watchlist, news. Company results dates are not available.

1. Ask or infer the style: momentum, breakout, pullback or oversold bounce, and long or short. Load `screening` with `loadTools` first; `getWatchlist` or `listUniverse` give the universe, `searchInstruments` finds single names.
2. Rank the whole universe with `scanUniverse` using the style's rules; never loop `getBars` symbol by symbol. For the finalists, `getBars` daily and `getIndicator` for RSI(14) and moving averages. Use `calculate` for 1-month and 3-month return, distance from the 52-week high, and volume vs the 20-day average.
3. Momentum: above the 50-day average, near the 52-week high, rising volume. Pullback: uptrend intact, RSI(14) cooled. Oversold bounce: RSI(14) stretched and price at support. Mirror these for shorts.
4. Drop names with thin volume or a news item about results inside the next few sessions (`getNews`; the calendar is macro only, so a results date is unconfirmed). Run the trend-check playbook on the survivors. `getFundamentals` (load `research`) can check company quality.
5. Present at most 5 ideas, ranked: symbol, setup, key level, trigger, invalidation, and the one risk that would make it wrong. Say which criteria each passed. Run the risk-reward playbook on each. `addToWatchlist` (in `screening`) if the user wants to keep them.
6. Past screen hits are a small sample and ignore costs; say so.
7. Do not chase a name already extended. For a considered decision on one name, `askDesk`.
8. Sizing via the position-sizing playbook, stop-loss required, and paper only.
