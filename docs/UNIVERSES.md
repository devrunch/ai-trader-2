# Universes

The sets of instruments a scan runs on (`modules/instruments`, `Universes`). A universe lists only instruments that exist in the instrument master, are active, and have a price feed (a Kite, Deriv or US-delayed mapping). Members that fail this are dropped and counted in the universe's `note`.

| Id | Members | Source |
|---|---|---|
| nifty50, nifty100, nifty500 | NSE index constituents | `nse-indices` adapter: `https://archives.nseindia.com/content/indices/ind_nifty50list.csv` (and `100`, `500`), stored in `universe_constituents` with `fetched_at` and `list_date` |
| forex-majors, forex-crosses | curated pairs, `FX:<PAIR>` | `domain/curated-universes.ts`, reviewed 2026-11-12 |
| commodities | MCX gold, silver, crude oil, natural gas, copper, zinc (continuous `1!`) and OANDA XAU/XAG/XPT/XPD | same file, 2026-11-12 |
| us-large | 50 large US stocks on NASDAQ and NYSE | same file, 2026-11-12 |
| crypto-majors | `CRYPTO:<BASE>USD` candidates | same file. The master lists no crypto yet, so this universe is empty (noted) until a source adds them under that exchange |
| watchlist | the user's watchlist | watchlists module |

## Refresh

The job `universes-refresh` fetches the three NSE lists every Monday 06:30 IST. A list older than 8 days is refetched when read. If a fetch fails the stored list is kept and the note says so.

Manual refresh: restart is not needed; trigger the job `universes-refresh` from the job runner, or delete the row in `universe_constituents` and read the universe.

## Vendored fallback

Used only when nothing was ever stored and the fetch fails: `infrastructure/nifty50-fallback.ts`, the 50 symbols of the NIFTY 50 constituent CSV reviewed 2026-11-08 (the same list as `popular-instruments.ts`). NIFTY 100 and NIFTY 500 have no vendored list: they rely on the fetch and are empty with the note "constituent list not fetched yet" until it succeeds.

To refresh the vendored list: download `ind_nifty50list.csv`, copy the `Symbol` column into `nifty50-fallback.ts` and update the date.
