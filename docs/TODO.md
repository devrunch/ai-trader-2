# TODO: pending tests and remaining work

Owner rule (2026-11-10): build everything that can be built now; anything that can't be tested for real yet is listed here with **what it needs**. Tick items with the date and the evidence.

## Pending tests (built, not yet verified for real)

| # | What | Needs | Since |
|---|---|---|---|
| T1 | **Live NSE session:** tick-to-paint p95 ≤ 300 ms (measured on the chart canvas, not the DOM), a full day with no gaps, NIFTY futures ticks 15:30–15:40 kept | A market day; Zerodha connected from `/admin` before 09:15 IST | P3-6 |
| T2 | **Laptop sleep/wake** on a real machine during market hours: the chart catches up without a reload | Market hours plus closing and reopening the laptop lid (manual) | P3-3 |
| T3 | **Connect Zerodha, full browser redirect** (not token paste) | Kite app redirect URL set to `http://localhost:5173/admin/zerodha/callback` (port 5173 free) | P2-10c/d |
| T4 | **Email alerts via Resend:** reminder, data report, ops watch, test email (`POST /api/v1/alerts/test`) | `RESEND_API_KEY`, `RESEND_DOMAIN` (domain verified in Resend), `ALERT_EMAIL_TO` in `apps/api/.env` | P3-8, P9-2 |
| T5 | **Paper trading costs** checked against Zerodha's published charges (equity, F&O, MCX) and SEC/FINRA fees for US sells; no contract note needed (owner 2026-11-11) | Re-check when rates change | P5-8, P5-9 |
| T6 | **Agent with a real model:** live chat, tools, paper orders and background tasks verified 2026-11-11 on Bedrock DeepSeek v3.2 (`pnpm eval:agent`: 8/8). Still open: a paper order filled live in NSE hours, and a condition task firing on a real cross | NSE market hours; Zerodha connected | P7 |
| T7 | **US stocks live (delayed):** quotes, history fill after the 30-day clamp fix | US market hours (19:00–02:30 IST); Yahoo reachable | P3-10 |
| T8 | **MCX Muhurat timing** | The next Muhurat session (2027) or the MCX circular | P3-7 |
| T9 | **2027 NSE/BSE/MCX holiday lists** | Exchange circulars, before 2027-01-01 | P3-7 |
| T10 | **TradingView parity fixtures** for indicators (P4-7) | Captured TradingView values on real NSE bars | P4 |
| T11 | **Two API instances plus a real network drop:** lease expiry, resubscribe, no gaps | Two machines or containers on a real network (staging) | P3-2 |
| T12 | **Kite auto-login from a static IP** (CAPTCHA-free) | AWS deployment with an Elastic IP (Phase 10) | P2-10c |
| T13 | **Closing-auction calendar change on 2026-12-07** (auction moves to 15:30–15:40) | That date; the 15:50 data report flags any drift | P3-7 |

## Known bugs (found in the UI review, 2026-11-10)

| # | Bug | Seen | Owner |
|---|---|---|---|
| B1 | Supertrend draws long diagonals across bars where the trend line should break | NSE:RELIANCE 5m | Worker (Phase 4) |
| B2 | Indicators are computed on bars the chart does not show: Bollinger Bands bulge through a candle gap | MCX:GOLD1! 5m, 9 Nov 13:00 to 10 Nov evening | Worker (Phase 4) |

## Remaining build work

| Area | Item | Status |
|---|---|---|
| Phase 4 | P4-5 live indicator socket; P4-6 Pine runtime (worker pool and patches); P4-9 indicator on indicator; P4-10 presets and templates; P4-11 indicator alerts; P4-12 Pine editor; P4-13 rest of wave 1; settings Style and Visibility tabs | not started |
| Phase 6 | P6-7 compute endpoint, `COMPUTE_URL`, Nest wiring, Docker image | not started |
| Phase 7 | Done: P7-1..P7-8 (models, chat, threads, action cards, drawings, evals, paper trading, background tasks, skills, calculator). Remaining: working memory (watchlist, risk settings, recent topics); notifications when a background task acts (email/Telegram) | mostly done |
| Phase 8 | Skills on the same version registry (vendored packs, patches, sandbox) | not started |
| Phase 9 | News, events, alerts, Home | not started |
| Phase 10 | AWS staging and prod, dashboards, §17 acceptance | not started |
| Phase 11 | Bar replay, second-based intervals, full built-in library | not started |
| Ops | Diagrams batch regeneration (`pnpm diagrams && pnpm diagrams:check`), deferred by the owner | pending |
