# Phase 1 close — 2026-11-08

## Delivered
| Task | What |
|---|---|
| P1-1 | `InstrumentId` (canonical `EXCHANGE:TICKER`), instrument model, master diff (renames scoped by exchange and identity), continuous futures |
| P1-2 | Durable BullMQ job scheduler: IST cron, cross-instance lock, runtime limit, catch-up and skip within a grace window, heartbeats |
| P1-3 | Kite session: scripted login (password, TOTP, redirect walk, exchange), stored token, daily 06:20 IST refresh, breaker, readiness |
| P1-4 | Sources: Kite (NSE, BSE, MCX, NFO, indices), Deriv (29 forex and metals), Nasdaq Trader (US), with TradingView-style IDs |
| P1-5 | Postgres master, per-source atomic daily refresh at 07:00 IST, change history, resolution (renamed, continuous, delisted, not found with suggestions) |
| P1-6 | MiniSearch search: trader-grade ranking (popularity, exchange preference, prefix rule, aliases), `GET /api/v1/instruments/search` and `/:id`, rate limit |
| P1-7 | Web symbol search: opens on any key, filters, recents, empty and error states; plain URL search params |
| P1-8a | C4 model generated from code (`architecture/model/generated.c4`), with a staleness check |
| P1-FIX1 | `runNow` never drops a trigger |

**Tests at close:** 238 unit, 29 integration.

## Verified with real data
- **Kite login:** the smoke run printed `kite login ok — expires 2026-11-09T00:30:00Z`.
- **Real refresh:** Kite 82,069, Deriv 29, Nasdaq 13,217 = 95,315 instruments in 27.9 s; a rerun added zero changes.
- **Search on the real master:** `gold` → `MCX:GOLD1!`, `OANDA:XAUUSD`; `relianse` → `NSE:RELIANCE`; `n` → `NSE:NIFTY`; uncached p95 16–18 ms over 100k instruments.

## Rulings
- Rename identity is `exchange|ISIN`, or the Kite `exchange_token`; a successor must be a new ID.
- Kite instrument dumps are public, so the daily refresh doesn't depend on the login.
- MCX dated contracts are typed `commodity`; continuous resolution accepts them.
- Expired derivatives are purged after 30 days; their IDs resolve to `SYMBOL_NOT_FOUND` with `reason: expired` and the date.
- Scheduler de-duplication compares occurrences, not finish times; `runNow` uses unique job IDs and a pending marker.
- `pnpm check` builds the packages before lint and typecheck.
- Search ranking: a curated popularity tier, then exchange preference (NSE over BSE; MCX first for commodities), then ticker prefix over description.

## Carried forward
- ISIN enrichment from NSE's public `EQUITY_L.csv` (backlog).
- The `KiteSession` "minted" log line prints during tests; to be silenced in P2-1.
- A UI screenshot of symbol search over the real master, at the Phase 3 terminal close, once the chart exists.
