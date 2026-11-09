# Phase 2 close — market data and candle store (2026-11-09)

## Delivered
| Task | What |
|---|---|
| P2-1 (+P2-2) | Market calendars (NSE/BSE holidays from circulars, Muhurat, MCX DST evening, NYSE rules, FX 24×5); session-anchored grid; aggregation; tick bar builder; repair merge |
| P2-3 | Monthly-partitioned `bars_1m`, `bars_1d`, forming bars in Redis, cursor reads with on-read aggregation (5,000 five-minute bars in 83 ms) |
| P2-4 | Kite history provider, shared Redis rate limit (3/s), read-through fill, nightly reconcile backfill |
| P2-5 | `ResilientFeed` (reconnect, watchdog, gap backfill), our own Kite websocket client and tick decoder |
| P2-6 (+P2-7) | Deriv forex and metals (public endpoint, backward paging), US delayed via Yahoo |
| P2-8 | `/api/v1/bars` and `/api/v1/quote/:id` with honest status (ok, delayed, stale + reason), typed errors, no vendor fallback |
| P2-9 | Market-data process: Redis leader lease, fencing, subscription requests, feed-state publishing, graceful shutdown |
| P2-10a | Login failures visible; Kite login caps (3 per 15 min, 6 per day, persisted); refresh lock; held continuous rollover |
| P2-FIX2 | App boot exports plus a real-`AppModule` test; Kite `instruments_meta` frame; index full mode with exchange timestamps |

**Tests at close:** 428 unit, 64 integration.

## Live acceptance (NSE, 2026-11-09 13:10–13:15 IST)
- **Token:** obtained through the official Kite redirect login (the owner logged in in a browser). No scripted login.
- **Ticks:** RELIANCE 495, NIFTY 1,192, MCX:GOLDZ2026 264.
- **Forced socket drop at 13:12:31:** live again at 13:12:32.
- **1-minute bars:** 3 of 3 per instrument in the measured window, no gaps.
- **RELIANCE** OHLC and volume are **identical** to Kite's official history for every minute, including the minute that spans the drop.
- **NIFTY** was 1–2.5 points off on open and close: index ticks were stamped with the receive time (ltp mode). Fixed with full mode, which carries exchange timestamps, and verified on a real captured frame.

## Findings that changed the design
- **CAPTCHA on scripted login.** Zerodha answered the scripted `/api/login` with "Invalid CAPTCHA values" from the owner's PC after several logins. The design is now:
  1. official "Connect Zerodha" first;
  2. auto-login only from the server's static IP;
  3. a CAPTCHA reply stops all automatic attempts;
  4. a hard login cap.
- **Deriv public endpoint and paging.** The old v3 URL answers 520. History must be paged backwards (`count` ≤ 1,000, `start` ignored).
- **Deriv forex and metals stop about 20:54 UTC on Friday**, so there's a quiet window for the watchdog.
- **The Muhurat window (18:00–19:00 IST) returned no Kite data.** Verify the time against the NSE circular every year.
- **Kite's 1-minute history for 2026-11-06 ends at 15:14.** That's Kite's own data, not a bug of ours.

## Open (moved to the next tasks)
- P2-10b auth, P2-10c Connect Zerodha and CAPTCHA handling, P2-10d admin panel.
- Continuous-history splicing (out of scope so far).
- Dukascopy tick volume for forex (later).
