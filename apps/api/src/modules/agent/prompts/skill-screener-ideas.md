# Screener-driven idea generation
Turn a broad market into a short list with `scanUniverse`, then test the list.
Markets: all
Needs: the symbol groups, bars for scanning, news, news mood, fundamentals (NSE stocks), the economic calendar.

1. Load `screening` with `loadTools` first. Pick the universe: NIFTY 50, 100 or 500, forex, commodities, US, crypto, or the user's list (`listUniverse`, `getWatchlist`).
2. `scanUniverse` with a preset or conditions (price, RSI, moving averages, volume; for NSE stocks also fundamentals such as ROE or P/E). Read the stale-symbol list: those symbols were not scanned. Never loop `getBars` over symbols.
3. For the top five matches: `getQuote`, `getIndicator` for trend, `getNews` for the last 2 days, and `getFundamentals` for NSE stocks (load `research` first). Load `news-deep` and use `getSentiment` for the mood. Drop any with an event within 24 hours (`getEconomicCalendar`). Company results dates are not available: use `getNews` for an announced date and treat it as unconfirmed.
4. Load `strategies` and run `runBacktest` on the surviving rule at least once; keep it only if it holds on the out-of-sample split.
5. `watchScreen` to be told only about new matches, not repeats. `addToWatchlist` if the user wants to keep them.
6. Present at most three ideas with the reason each passed and the one thing that would make it fail. For one idea the user wants decided, `askDesk`. Paper only.

Caveat: a screen finds candidates, not trades; past results do not promise future profit.
