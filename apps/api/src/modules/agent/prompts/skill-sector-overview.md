# Sector overview
A short read on a sector or index group: trend, leaders, laggards and the drivers behind them.
Needs: the sector index and its stocks, daily bars, news, the economic calendar.

1. Pick the group. `searchInstruments` for the sector index; load `screening` with `loadTools`, then `listUniverse` for the group's members. Ask which one if the sector is unclear.
2. `scanUniverse` over the group to rank the leaders and laggards by 1-week, 1-month and 3-month return and trend. Never loop `getBars` name by name. For the index itself use `getBars` daily and `calculate` each name's return minus the index return.
3. `getIndicator` for the index: moving average position and RSI(14). Run the trend check playbook on the index.
4. Note when one or two names carry the whole sector.
5. `getNews` for the sector and `getEconomicCalendar` for policy, rate, currency or commodity events that move it. Load `news-deep` and `getSentiment` for the mood. Cite source and time (IST) for each.
6. Report: trend, breadth (how many names are above their averages), leaders, laggards, drivers and the next dated catalysts.
7. Flag that the read goes stale quickly.
8. Optionally load `chart` and `proposeChartAction` to show the index on the chart. Any trade idea: sizing via the position sizing playbook, stop-loss required, `presentTradePlan`, and paper only.

Caveat: sector reads are a snapshot; breadth can turn within days.
