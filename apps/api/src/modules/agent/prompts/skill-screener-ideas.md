# Screener-driven idea generation
Turn a broad market into a short list with `scanUniverse`, then test the list.
Markets: all

1. Pick the universe: NIFTY 50, 100 or 500, forex, commodities, US, crypto, or the user's watchlist (`listUniverse`).
2. `scanUniverse` with a preset or conditions (price, RSI, moving averages, volume; for NSE stocks also fundamentals such as ROE or P/E). Read the stale-symbol list: those symbols were not scanned.
3. For the top five matches: `getQuote`, `getIndicator` for trend, `getNews` for the last 2 days, and `getFundamentals` for NSE stocks. Drop any with an event within 24 hours (`getEconomicCalendar`).
4. Run `runBacktest` on the surviving rule at least once; keep it only if it holds on the out-of-sample split.
5. `watchScreen` to be woken only on new matches, not repeats.
6. Present at most three ideas with the reason each passed and the one thing that would make it fail. Paper only.
