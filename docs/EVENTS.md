# Economic events: knowledge, actuals and surprise

Owner: `apps/api/src/modules/calendar`. Every source below is an adapter under `infrastructure/sources/` and is listed in `docs/DATA-SOURCES.md`.

## Sources

| Source id | What | Key | Terms | Status |
|---|---|---|---|---|
| `ff-weekly` | Schedule, forecast, previous (no actuals) | none | ForexFactory weekly JSON, two files every 3 h | live |
| `ff-event-specs` | What each of 693 recurring events measures and which side of the forecast is good | none | Vendored JSON from the old product; no HTTP | live |
| `fred` | US actuals: CPI, core CPI, core PCE, PPI, retail sales, industrial production, hourly earnings, unemployment rate, payrolls, jobless claims, fed funds target (upper), GDP | `FRED_API_KEY` (blank = off, reported "off (no key)") | FRED API, 120 requests/min allowed, we use at most 100/min; one request per US event near its release | live, needs the key |
| `rbi-actuals` | Repo-rate decision | none | RBI Monetary Policy page and the MPC resolution press release; one check every 3 minutes, only within 90 minutes of a decision | live (fixtures recorded 2026-11-13) |
| `mospi` | Release dates (schedule, not values) | none | The PDF named by MoSPI's own "latest release calendar" JSON pointer, read when the link changes; vendored dates are the fallback | live |
| `mospi-actuals` | CPI / IIP / GDP values | none | not built | skipped, see below |

### Why `mospi-actuals` is skipped

mospi.gov.in is a JavaScript single-page app. Its own JSON API lists press releases as links to PDFs (for example `latest_release_..._Press_Release_of_CPI_for_October_2026_.pdf`); the headline figures exist only inside those PDFs, and each PDF has its own layout and a different file name per release. Reading a figure out of a PDF paragraph would be guessing, so the source is not built. The headline numbers can be added from another place that publishes them as text (the PIB press-release HTML pages that the calendar PDF links to are the candidate) when a stable parse is worth the work. Until then India CPI, IIP and GDP events have no actual and no surprise.

### MoSPI calendar discovery

`documents/get-latest-release-calender` returns the current Advance Release Calendar PDF (at the time of writing "ARC 2026-27 updated till October 2026", newer than the September file vendored in `domain/india-schedule.ts`). The adapter reads its text with `unpdf` (MIT, a build of Mozilla pdf.js without native parts), takes the CPI, IIP and quarterly GDP rows, and gives every release 16:00 IST. A release due on a weekend moves to the next working day: the calendar states this, and 2026-04-12 and 2026-06-28 were in fact released on the Monday. Public holidays are not known and are not shifted. The vendored list stays as the fallback: a vendored release is dropped only when discovery found the same kind of release in the same month. The `mospi` health shows the number of upcoming discovered releases; zero means discovery broke (or the calendar ran out), even though the vendored dates still appear.

The site also has a POST API (`release-calender/fetch-all-release-calender-Web`) that lists published releases by year/month. It lists past releases and today's only, not the future, so it is not used.

## How an actual and its surprise are computed

1. `event-actuals` job runs every minute (India time). It asks each source only about events from 2 minutes before to 90 minutes after their release.
2. Sources are tried in priority order; the first answer per event wins. A failing source is logged and skipped.
3. `FRED`: a ForexFactory USD title maps to one series in a small table (`domain/fred-series.ts`). The observation counts only if it is dated the event's reference period (first of the previous month for monthly series, first of the previous quarter for GDP, the Saturday ending the previous week for claims, the event day for the fed funds target). An older observation is never reported as today's actual. The figure is converted to the unit ForexFactory prints: m/m and y/y percent from the index level (one decimal), payroll change in thousands, claims in thousands, rates as a percent.
4. The actual is stored once in `economic_events` (`actual`, `actual_source`, `actual_at`). The same value again is a no-op. A source may correct its own value within 24 hours of storing it; the correction is logged. Refreshing the ForexFactory schedule never touches these columns.
5. `surprise = actual - forecast` in the event's own unit (`parseReleaseValue` reads `0.3%`, `-0.1%`, `225K`, `1.2M`, `<0.1%`, `1,234.5`). It is null when either side is not a number or the units differ.
6. `surprise_z = surprise / population standard deviation` of the stored surprises of the same `country|title` released earlier (newest 60). It is null with fewer than 8 past releases or when the history has no spread.
7. `beat` in an event's `spec` says whether a higher actual is good (`higher-better`), bad (`lower-better`, 29 events such as unemployment) or not a number comparison (`unknown`, for example statement tone).

## Replays

`EconomicCalendar.list(query, asOf)` hides an actual whose `actual_at` is after `asOf` (actual, source, surprise and z all null), so a backtest never sees a value that was not yet published.
