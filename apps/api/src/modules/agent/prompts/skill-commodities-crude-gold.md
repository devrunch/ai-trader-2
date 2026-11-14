# Commodities: crude oil and gold
Trade energy and metals from the inventory calendar, the dollar and real yields.
Markets: commodities
Needs: market status, the economic calendar, a dollar quote, news, past event reactions, daily ATR.

1. `getMarketStatus` for the instrument: MCX has an evening session until 23:30 or 23:55 IST; metals and oil on Deriv follow the forex week.
2. Crude: `getEconomicCalendar` for the weekly crude inventory release (EIA, Wednesday). Load `events` with `loadTools`; `getEventScorecard` shows how crude moved after a draw or a build. A larger-than-forecast draw is bullish, a build bearish.
3. Gold: the dollar and US real yields drive it. `getQuote` on a dollar proxy, `getEconomicCalendar` for US inflation, jobs and Fed events. A hot US print is usually bearish for gold.
4. `getNews` for the commodity (OPEC, sanctions, supply). Load `news-deep` with `loadTools`; `getSentiment` gives the news mood. Treat `getCrowd` as opinion only. `webSearch` (in `research`) can fill a gap the feeds miss.
5. `getIndicator` ATR(14) on 1D: commodities gap on news, so size from ATR and keep a hard stop. End with `presentTradePlan` if there are levels.
6. For MCX contracts, check the expiry month in the id before trading and avoid the last week of an expiring contract. Paper only.
