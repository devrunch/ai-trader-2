# US earnings playbook
Decide whether to trade around a US company's results, and how.
Markets: us
Needs: daily bars, news, news mood, market status. Company results dates are not available (the calendar is macro only).

1. Company results dates are not available: ask the user, or use `getNews` for an announced date, and treat the date as unconfirmed. Say whether it is before the open or after the close if known. `getMarketStatus` shows when the next regular session opens. `getEconomicCalendar` covers macro events only.
2. `getBars` daily, 1 year: the average absolute move on the last 4 earnings days, with `calculate`. That is the typical-move reference; options-implied moves are not available.
3. `getNews` for guidance tone and analyst changes. Load `news-deep` with `loadTools`, then `getSentiment` for the mood; `getCrowd` is retail opinion only. Load `research` for `getFundamentals` and `webSearch` if the feeds miss the context.
4. Do not hold a position through results without the user's explicit instruction: the gap can pass any stop. Prefer waiting for the first 30 minutes after the open and trading the opening range.
5. After the report, score the move with the earnings reaction playbook, then size with the risk ATR correlation playbook using the post-gap ATR, and finish with `presentTradePlan`. For a considered decision, `askDesk`.
6. Pre-market and after-hours prices are thin; say when a quote is from extended hours. Paper only.

Caveat: an unconfirmed date means the plan can be wrong; results gaps are the biggest single risk in a stock.
