# Sector overview
A short read on a sector or index group: trend, leaders, laggards and the drivers behind them.


1. Pick the group. `getWatchlist` or `searchInstruments` for the sector index and 5 to 8 liquid constituents. Ask which one if the sector is unclear.
2. `getBars` daily for the index and each name. With `calculate`, get the 1-week, 1-month and 3-month return, and each name's return minus the index return.
3. `getIndicator` for the index: moving average position and RSI(14). Run the trend-check skill on the index.
4. Rank leaders and laggards by relative return. Note when one or two names carry the whole sector.
5. `getNews` for the sector and `getEconomicCalendar` for policy, rate, currency or commodity events that move it. Cite source and time (IST) for each.
6. Report: trend, breadth (how many names are above their averages), leaders, laggards, drivers and the next dated catalysts.
7. Flag that the read goes stale quickly.
8. Optionally `proposeChartAction` to show the index on the chart. Any trade idea: sizing via the position-sizing skill, stop-loss required, and paper only.
