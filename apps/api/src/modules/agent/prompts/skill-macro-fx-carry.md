# Macro and forex: rates, sessions, carry
Frame a forex or metals idea from rate differentials, the active session and the next central-bank event.
Markets: forex, commodities

1. `getMarketStatus` for the pair: which of Sydney, Tokyo, London and New York are active. Liquid moves come at the London and New York overlap; thin sessions widen spreads, so size down.
2. `getEconomicCalendar` for both currencies' countries over the next 3 days: policy decisions, inflation, jobs. Note the central banks' last decisions with `getNews`.
3. Rate differential: the currency with the higher policy rate carries positive swap when held long. State both rates only if a tool result gave them; otherwise say the differential is unknown.
4. `getIndicator` EMA(50) and EMA(200) on 1D: trade with the trend unless a surprise just reversed the rate path.
5. Carry trades fail when volatility jumps: check ATR(14) against its 60-day average (`calculate`); a ratio over 1.5 means skip or halve the size.
6. Never hold into a high-impact release unless the plan is the release (use the event-surprise skill). Close before the Friday 22:00 UTC market close to avoid weekend gaps.
