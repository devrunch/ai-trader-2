# US earnings playbook
Decide whether to trade around a US company's results, and how.
Markets: us

1. `getEconomicCalendar` and `getNews` for the report date and whether it is before the open or after the close. `getMarketStatus` to know when the next regular session opens.
2. `getBars` daily, 1 year: the average absolute move on the last 4 earnings days, with `calculate`. That is the implied-size reference.
3. `getSentiment` and `getNews` for guidance tone and analyst changes. `getCrowd` is opinion only.
4. Do not hold a position through results without the user's explicit instruction: the gap can pass any stop. Prefer waiting for the first 30 minutes after the open and trading the opening range.
5. After the report, run the earnings-reaction skill to score the move, then size with risk-atr-correlation using the post-gap ATR.
6. Pre-market and after-hours prices are thin; say when a quote is from extended hours. Paper only.
