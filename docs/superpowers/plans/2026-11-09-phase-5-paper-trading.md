# Phase 5 — Paper Trading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution model:** manager (Claude) → employee per `docs/process/WORKFLOW.md`; one brief per task in `docs/tasks/P5-<n>.md`.

**Goal:** A user can trade Indian instruments on paper with live prices, realistic costs, risk limits and an intraday square-off, and nothing is ever filled twice.
- **Orders:** market, limit, stop (SL-M) and stop-limit (SL); buy or sell; product MIS, CNC or NRML; an optional stop-loss and target that become OCO exit orders once the entry fills.
- **Fills:** from live prices only; a stop the price gaps through fills at the next price (the bar's open), never at the stop.
- **Money:** one INR account per user (FR-PT-1, Q4), margin-based buying power, positions with average price, realised and unrealised P&L, every charge itemised on the fill.

**Architecture:**
- **Module:** `apps/api/src/modules/paper-trading/{domain,application,infrastructure,api}`. The domain is pure: order rules and state machine, matching against a bar, cost model, risk gates, position netting, session rules.
- **Persistence:** PostgreSQL tables `paper_accounts`, `paper_orders`, `paper_fills`, `paper_positions` (migration `0010_paper_trading.sql`). Every write runs in one transaction that locks the account row (`SELECT … FOR UPDATE`).
- **Matching:** a durable `paper-match` job (JobScheduler, every 5 s, one runner across instances) reads the 1-minute bars since each open order was placed through `MarketDataService.bars` (stored plus forming bar) and evaluates each order against them. The job holds a subscription lease (`RequestSubscription`) for every instrument with open orders so the feed keeps producing bars.
  - *Why poll, not subscribe to `md:bars:<id>`:* bars are the same data; polling survives restarts and missed messages with no subscriber state (a missed pub/sub message is a missed fill), runs once across instances through the job lock, and re-evaluates history so catch-up after downtime fills at the historical crossing price. Cost: up to 5 s of latency, which a paper account tolerates.
- **Square-off and expiry:** a durable `paper-square-off` job (every minute, IST) cancels open MIS orders and squares off MIS positions once `now ≥ session close − 10 min` (15:20 IST for NSE/BSE/NFO, Muhurat and half days follow the calendar), and expires every DAY order at its session close. A missed run is caught up on the next minute.
- **Idempotency (NFR-RB-4):** `clientOrderId` unique per account (a repeat returns the original order; a different payload under the same id is `409`); a fill is a conditional `UPDATE … WHERE status = 'open'` plus a unique `paper_fills.order_id`; square-off orders use `clientOrderId = squareoff:<positionId>:<squareOffAt>`.
- **API:** `/api/v1/paper/*`, session-authenticated, CSRF header on POST; contracts in `@aitrader/contracts/paper`.
- **Paper only:** no broker client is imported anywhere in the module.

**Spec:** SRD §7.4 (FR-PT-1..7), NFR-RB-4, NFR-RB-5, E9, E17, E22, E25.

## Global Constraints
- Phase 0–3 constraints plus `AGENTS.md`.
- **Fail closed:** any risk check that can't decide (no price, unknown calendar, unsupported instrument) rejects with a reason.
- **Rejections are orders too:** a rejected order is stored with `status = rejected` and a `rejectReason`, so a retry of the same `clientOrderId` returns the same rejection.
- **Square-off never fails on a gate:** it bypasses risk gates and fills at the last known price if no fresh one exists.
- **Rates are constants with their source** in `domain/cost-model.ts`; changing a rate is a reviewed change.

## Review Focus
1. **Double fill:** two matcher runs (or two instances) on the same order produce exactly one fill and one position change.
2. **Gap through a stop:** a sell stop at 100 with the next bar opening at 95 fills at 95 (less slippage), not 100.
3. **Retry storm:** the same `clientOrderId` posted 5 times concurrently creates one order.
4. **Square-off after a restart at 15:24:** the job's next minute squares off every MIS position, once.
5. **Costs:** a ₹1,00,000 NSE intraday round trip matches the worked example in `cost-model.spec.ts`.

## Tasks
| Task | What | SRD |
|---|---|---|
| **P5-1** Domain | `order.ts` (types, validation: quantity × lot size, tick multiples, stop-limit ordering), the state machine (`open → filled \| cancelled \| expired`, `rejected` at placement only, stop-limit `triggered`), `matching.ts` (evaluate an order against a price or a bar, gap rule, slippage), `position.ts` (netting, average price, realised P&L, flips), `cost-model.ts` (Zerodha-style charges by segment), `risk.ts` (pure `(ok, reason)` gates), `session-rules.ts` (expiry and square-off time from a session window) | FR-PT-2, 4, 6 |
| **P5-2** Persistence | Drizzle schema + `0010_paper_trading.sql`; `DrizzlePaperStore` with account-locked transactions, conditional fills, unique `(account_id, client_order_id)`; Testcontainers spec: concurrent duplicate placement, double fill, migration applies | FR-PT-1, 3, NFR-RB-4, E17 |
| **P5-3** Use cases | `PlaceOrder` (resolve, gates, immediate fill on a fresh quote), `CancelOrder`, `ExecuteFill` (charges, position, cash, OCO children and siblings), `ReadPortfolio` (account, orders, positions with unrealised P&L, fills); in-memory store tests | FR-PT-1..4, 6 |
| **P5-4** Matching job | `MatchOpenOrders` + `paper-match` registration (every 5 s); subscription leases for instruments with open orders; tests for crossing, gap, idempotent re-run, stale data | FR-PT-2, NFR-RB-5 |
| **P5-5** Square-off and expiry | `SquareOff` + `paper-square-off` registration (every minute); cancel MIS orders, flatten MIS positions, expire DAY orders; idempotent client ids; catch-up after a missed window | FR-PT-5, E22, E25 |
| **P5-6** API | Zod contracts (`PaperPlaceOrderRequest`, `PaperOrder`, `PaperPosition`, `PaperAccount`, `PaperFill`); `GET account`, `GET orders`, `POST orders`, `POST orders/:id/cancel`, `GET positions`, `GET fills`; SessionGuard + CsrfHeaderGuard; controller tests | FR-PT-1, 3, 7, E9 |
| **P5-7** Web panel | Terminal side tab "Positions": positions with live P&L, open orders with cancel, a compact order ticket; TanStack Query hooks; all async states | FR-UI-1, FR-PT-1 |
| **P5-8** Acceptance | A live NSE session: place, fill, stop gap, square-off at 15:20, costs on the contract note compared with a Zerodha contract note | §17 |

Each brief carries exact contracts and tests, as in Phases 1–3.
