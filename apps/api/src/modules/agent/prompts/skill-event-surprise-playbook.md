# Event and surprise trading
Trade a scheduled release from how the instrument reacted to past surprises, not from a guess.
Markets: all
Needs: the economic calendar, the instrument's past reactions to this release, and short-interval bars.

1. `getEconomicCalendar` for the release: forecast, previous, impact. Skip low-impact events.
2. Load `events` with `loadTools` first. `getEventScorecard` for the event title: the average move 15 minutes after a beat and after a miss, the number of past releases, and whether the event is inverted (a higher number is bad news). Fewer than 8 releases means the history is weak; say so.
3. Write both branches before the release: beat (surprise above the threshold), miss, in line. For each give the direction, the typical move, the level that would invalidate it.
4. `watchEvent` with `minSurprise` or `minSurpriseZ` and `briefMinutes` so you are woken after the release only if the surprise is large.
5. After the release: read the actual and surprise, check which branch happened, then confirm with price (`getBars` 1 or 5 minute) before entering. A reaction against the branch is a no-trade.
6. Size with the risk-atr-correlation playbook; the stop goes beyond the release spike, not inside it. For a considered view on one instrument, `askDesk`. Finish with `presentTradePlan`. Paper only.
