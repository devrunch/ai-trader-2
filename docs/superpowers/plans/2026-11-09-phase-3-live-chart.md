# Phase 3 — Live Streaming and Terminal Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution model:** manager (Claude) → employee (Codex) per `docs/process/WORKFLOW.md`; one brief per task in `docs/tasks/P3-<n>.md`.

**Goal:** The terminal shows a real, gap-free, live-updating chart for any instrument.
- **Data:** history by cursor, then a snapshot plus sequenced updates over a socket.
- **Resync:** after a drop, a hidden tab or a wake-up, the chart catches up without a reload.
- **Speed:** within the SRD's loading budgets.

**Architecture:**
- **API:** a Socket.IO gateway authenticated by the session cookie. The client subscribes through `RequestSubscription`, so the market-data process opens vendor feeds on demand. Updates from the market-data process reach every API instance through Redis pub/sub (`md:bars:<id>`), each carrying a per-instrument `seq`.
- **Web:** `LiveStore` (Phase 0) is fed by the socket. The chart adapter on Lightweight Charts 5.2 subscribes imperatively (`series.update`). History comes from `/api/v1/bars` through TanStack Query with cursor paging.

**Spec:** SRD §7.1 (FR-CH-1, 4, 5, 6), §7.3 (FR-LS-1..4), §6 (FR-UI-1, 6, 7, 8, 9), NFR-PF-1..5, E7–E12, E14, E15.

## Global Constraints
- Phase 0–2 constraints plus `AGENTS.md`.
- **Ticks never pass through React state** (LiveStore plus imperative chart updates).
- **Every update carries `seq`.** A gap, a reconnect, `visibilitychange → visible` or `online` triggers `GET /bars?since=<lastBarTime>` and an idempotent merge by bar time (the server wins).
- **The client clock never decides bar boundaries.** The server's bar times are authoritative; the client tracks its offset from the server (E14).

## Review Focus
1. **Laptop sleep for 20 minutes, then wake (E7/E8):** the chart backfills exactly the missing bars, with no duplicates and no reload.
2. **Switching symbol during a slow load (E15):** the old request is cancelled and its late answer is never painted.
3. **Out-of-order or duplicate updates (E10/E11):** the bars stay correct.
4. **A tick at exactly the bar boundary arriving late:** it's applied to the right bar.
5. **Market closed or provider down:** the chart says why (FR-UI-7), never shows an empty canvas.

## Tasks
| Task | What | SRD |
|---|---|---|
| **P3-1** Bar fan-out | The market-data process publishes forming and closed bar updates to Redis (`md:bars:<id>`) with a per-instrument monotonically increasing `seq` (Redis `INCR`); there's a `GET /api/v1/bars/seq?symbol` to resync | FR-LS-2, E16 |
| **P3-2** Socket gateway | Socket.IO 4.8 on the API, session-cookie auth; `subscribe { symbol, interval }` → `snapshot { bars, seq, status }`, then `bar { bar, seq }` and `status { state, reason }`; ref-counted `RequestSubscription`; per-tab subscriptions; a rate limit; tested with the Socket.IO client and fake Redis | FR-LS-1..2, E24 |
| **P3-3** Resilient client | `shared/live/socket-client.ts`: reconnect with backoff (`@aitrader/resilience`); resubscribe; gap detection by `seq`; resync on `visibilitychange`, `online` and reconnect; the server time offset; it feeds `LiveStore` | FR-LS-3/4, E7–E11, E14 |
| **P3-4** Chart adapter | A Lightweight Charts 5.2 adapter: history paging by cursor (`before`); live updates through `LiveStore.subscribeAll`; candles plus a volume pane (null volume → empty); all colours from theme tokens; resizes with the panel | FR-CH-1, 5, NFR-PF-1/2 |
| **P3-5** Terminal UI | A real terminal page: symbol header (price, change, status badge: live, delayed, stale + reason), interval picker, chart, the watchlist panel (popular instruments with live prices through `useLiveValue`), the connection indicator (FR-UI-8), empty and error states (FR-UI-7), skeleton and refetch behaviour (FR-UI-6) | FR-UI-1, 6–9, FR-CH-4 (layout persistence later) |
| **P3-6** Performance and acceptance | Measure first paint warm ≤ 1 s and cold ≤ 2.5 s p95, switching back ≤ 150 ms, older page ≤ 800 ms, tick to paint ≤ 300 ms p95; the bundle ≤ 250 KB; a live NSE session test with sleep and wake simulation; screenshots | NFR-PF-1..5, §17 |

Each brief carries exact contracts and tests, as in Phases 1 and 2.
