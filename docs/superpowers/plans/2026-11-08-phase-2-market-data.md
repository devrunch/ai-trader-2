# Phase 2 — Market Data and Candle Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution model:** manager (Claude) → employee (Codex) per `docs/process/WORKFLOW.md`. Each task below becomes one brief in `docs/tasks/P2-<n>.md`, written when it starts. The briefs carry exact signatures; this plan carries the decisions.

**Goal:** Real prices flow in from Kite (NSE, BSE, MCX, NFO), Deriv (forex and metals) and a delayed US feed. They become gap-free 1-minute bars in Postgres plus a forming bar in Redis, and are readable through one typed `MarketDataService` with cursor history and typed reasons. Dropped vendor sockets reconnect, backfill and repair by themselves.

**Architecture:**
- **New API module `market-data`:** domain = bars, sessions, the bar builder; application = the `MarketDataProvider` port, history and quote use cases; infrastructure = the Kite, Deriv and US adapters, the candle-store repository, Redis forming bars.
- **A second entrypoint** in the same codebase, `apps/api/src/market-data.main.ts`, runs only the vendor sockets and the bar builder, under a Redis leader lock (SRD §10.5: one Kite websocket holder, even across deploys).
- **The API process** reads bars and quotes, and asks for subscriptions through Redis.

**Tech Stack:** `kiteconnect` 5.3.0 (`KiteTicker` and historical), `ws` 8.22 (the Deriv JSON websocket API; `@deriv/deriv-api` was last published in 2024 and is skipped), `yahoo-finance2` 4.0.6 (US delayed bars), `@date-fns/tz` 1.5 (session and time-zone maths), Postgres 18 (monthly-partitioned `bars_1m`), Redis 8 (streams for ticks, hashes for forming bars), BullMQ (backfill jobs).

**Spec:** `docs/SRD.md` §7.2 (FR-MD-1..5), §7.1 FR-CH-5/6, §8.1 NFR-RB-1/2/3/6/7, §9 E1–E6, E11–E13, E16, E23. Phase 1 contracts: `InstrumentId`, `ResolveInstrument` (continuous futures), the Kite session.

## Global Constraints
- Everything in the Phase 0 and Phase 1 constraints, plus `AGENTS.md`.
- **Bar time:** the bar's *start*, in UTC; start inclusive, end exclusive (E12). The interval grid is anchored to each instrument's session open, in its own time zone (`Asia/Kolkata` for Indian markets, `America/New_York` for US), not to UTC midnight.
- **Providers** return data **or** a typed reason: `NO_DATA | MARKET_CLOSED | UNSUPPORTED | RATE_LIMITED | PROVIDER_DOWN | AUTH_EXPIRED`. They never return `null`, never an empty array for a failure, and never invent bars (FR-MD-1).
- **No fabricated candles:** a minute with no trades produces no bar. Gaps outside sessions are expected, and the chart's index-based axis handles them.
- **Vendor sockets** are owned only by the market-data process. The API never opens one.
- **Rate limits are shared** across processes through a Redis-backed token bucket. Kite historical is 3 requests per second (FR-MD-4).
- **Tests use recorded fixtures and fake sockets.** Real-vendor checks are manager-run smoke scripts, during market hours where needed.

## Review Focus
1. **The socket stays connected but goes silent during market hours (E2).** The watchdog reconnects after 30 s, and the missed minutes are backfilled and marked `repaired`. Test in P2-5.
2. **A tick lands exactly on a minute boundary** (09:16:00.000 IST): it belongs to the 09:16 bar (E12). Ticks out of order or duplicated never double-count (E11). Tests in P2-1.
3. **Holidays and special sessions** (NSE Muhurat, US half days, the DST shift): no bars are built outside a session, and the session grid is right on DST days (E13). Tests in P2-2.
4. **The Kite token expires mid-day or the login fails (E3).** Indian instruments report `AUTH_EXPIRED` or stale with a reason; nothing silently falls back to another vendor as if it were live. Test in P2-8.
5. **The process restarts mid-session (E16).** The forming bar is rebuilt from Redis plus a backfill of the current minute; no duplicate rows. Test in P2-5 and P2-9.

---

## Tasks

| Task | What | Key decisions | SRD |
|---|---|---|---|
| **P2-1** Bars domain | `Bar`, `Interval` (1, 3, 5, 15, 30, 60, 240 minutes, 1D, 1W, 1M), the session-anchored grid, `aggregate(bars1m, interval, session)`, `BarBuilder` (tick to a forming bar, close on the boundary, merge out-of-order ticks into the right bar or drop them after close), `mergeRepair(live, vendor)` (vendor wins; set `repaired`) | Pure; volume is `null` when the feed counts none (FX), never 0 | FR-CH-6, E11, E12 |
| **P2-2** Sessions and calendars | `MarketCalendar` per exchange: sessions in their time zone, holidays, special sessions; `isOpen(at)`, `nextOpen(at)`, `sessionFor(date)` | Seeded from curated JSON for 2026–2027: NSE and BSE holidays plus Muhurat; MCX evening session to 23:30 (23:55 when the US is on DST); NYSE holidays and half days by rule; FX 24×5 (Sunday 22:00 to Friday 22:00 UTC). Stored in Postgres, overridable by the admin later | FR-SY-2 session, E13 |
| **P2-3** Candle store | `bars_1m` (`instrument_id`, `ts`, OHLC, `volume` nullable, `source`, `repaired`), monthly range partitions created ahead by a job; `bars_1d` (adjusted + raw); repository: `upsert(bars)`, `range(id, from, to)`, `before(id, ts, limit)`, `since(id, ts)`; intervals above 1 minute are aggregated on read through the P2-1 grid | Upsert key `(instrument_id, ts)`; batched writes; a 2-year retention job for 1-minute bars (Q5 default) | FR-MD-2, FR-CH-5, NFR-PF-2 |
| **P2-4** Kite historical and backfill | Kite historical adapter (interval chunk limits, shared 3/s bucket, typed reasons); **read-through:** an empty range requested gets fetched, stored and returned; nightly backfill job for the "held" universe (popular plus watchlists later) with a reconcile step (`mergeRepair`) | Read-through is single-flight per `(instrument, range)`; uses the P1-3 token; the breaker opens on 3 consecutive vendor errors | FR-MD-2/4, E4, E6 |
| **P2-5** Kite live ticker | Wraps `KiteTicker`. Subscription manager: 3 connections × 3,000 tokens, ref-counted, 60 s grace on the last unsubscribe. Our own reconnect (backoff with jitter); resubscribe everything; **gap backfill** of missed minutes after a reconnect; **half-open watchdog** (30 s without ticks while a subscribed instrument's session is open, then reconnect). Ticks go to a Redis stream `ticks:<id>`; the builder updates the forming bar in Redis and persists closed bars | Built-in auto-reconnect off, so recovery is ours and testable; a fake socket server in tests | FR-MD-4/5, E1, E2, E16 |
| **P2-6** Deriv adapter | `ws` client: `ticks` subscribe and `ticks_history` (candles) for history; the same reconnect, watchdog and gap-backfill contract as P2-5; tick volume from tick counts (`volumeType: 'tick'`) | Shares the reconnect and backfill policy code with P2-5 through one `ResilientFeed` base (no duplication, jscpd-enforced) | FR-MD-1, E5 |
| **P2-7** US delayed adapter | `yahoo-finance2` chart API for 1-minute and daily history, polled every 60 s for subscribed US symbols; everything flagged `delayed: true` with the delay in minutes | Its own breaker; `RATE_LIMITED` mapped from HTTP 429 | FR-MD-1, FR-UI-8 |
| **P2-8** `MarketDataService` and REST | Facade over the providers by mapping (`instrument_mappings`): `bars(id, interval, { before \| since, limit })` and `quote(id)`. Continuous IDs resolve through `ResolveInstrument`. `GET /api/v1/bars` and `GET /api/v1/quote/:id` with contracts. Every response carries `status` (`ok \| stale \| delayed`) and `reason?` | Never substitutes one vendor for another silently (E3); a stale cache is served with a `stale` flag when a breaker is open (E6) | FR-MD-1, FR-CH-5, §11, E3, E6 |
| **P2-9** Market-data process and leader lock | `market-data.main.ts`: `SET NX PX` leader lock with renewal, standby takeover in ≤ 15 s, subscription requests over Redis (`md:subscribe` with ref counts), graceful shutdown flushes forming bars (NFR-RB-7); rebuild after restart (E16) | Same image, different command; one active leader | §10.5, NFR-RB-7/8, E16, E25 |
| **P2-10** [manager] Phase close | LikeC4 (the market-data container and its components), feature READMEs, a live smoke during NSE hours: subscribe to NIFTY, RELIANCE, GOLD1! and XAUUSD; kill the socket; check the gap backfill is repaired and zero 1-minute bars are missing against Kite history for that window; tag `phase-2` | — | §17 acceptance (partial) |

Each task's brief adds exact interfaces, the tests to write first (named for the E-rows they cover), and the done criteria, in the Phase 1 brief format.
