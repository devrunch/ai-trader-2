# Phase 4 — Indicator Engine, Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution model:** manager (Claude) → employee per `docs/process/WORKFLOW.md`; one brief per task in `docs/tasks/P4-<n>.md`.

**Goal:** one indicator engine that every caller (chart, agent, alerts, scans, backtests) uses, so a value is the same everywhere.
- **Built-ins** run natively (trading-signals 8.3.0, wrapped to TradingView semantics); **custom Pine** runs on patched PineTS 0.13.1. Callers never know which (FR-IN-31).
- **Live:** the forming bar updates every indicator on every tick, from saved state, never a full recompute (FR-IN-5/6).
- **Parity:** each native built-in equals its own Pine source run on PineTS to 1e-9, warm-up bars included (FR-IN-2).

**Architecture:**
- **API module `indicators`** (`apps/api/src/modules/indicators/{domain,application,infrastructure,api}`).
  - `domain/`: the built-in catalog (definition, TradingView inputs, plots, levels, the built-in's Pine source), input resolution (defaults, min/max/options), price sources, plot offset (batch and streaming), warm-up estimate. Pure.
  - `application/`: `IndicatorService` (`list`, `get`, `compute`, `open` → stream), the `IndicatorRuntime` port, `RuntimeResolver`. Bars come from `MarketDataService.bars` (its `ReadBars` plus resolve plus status).
  - `infrastructure/native/`: `NativeRuntime`, one kernel per built-in over trading-signals where its semantics equal TradingView's (SMA, WMA, RMA/WSMA, RSI, TR/ATR, VWMA) and small TradingView-exact kernels where they don't (SMA-seeded EMA, session-anchored VWAP, Pine's `ta.supertrend`, stochastic with K before D).
  - `infrastructure/pine/`: `PineRuntime` over PineTS in a worker pool (P4-6).
  - `api/`: `GET /api/v1/indicators`, `GET /api/v1/indicators/:ref`, `POST /api/v1/indicators/compute`; socket `subscribeIndicators` on the live gateway (P4-5).
- **Contracts** (`@aitrader/contracts`, `indicator.ts`): definitions, input values, compute request, `IndicatorResult` (columnar: `times[]` plus one `values[]` per plot, `status` from the bars), live `IndicatorUpdate { instanceId, barTime, values, seq }`.
- **Web:** indicator series on the Lightweight Charts adapter, the legend, the settings dialog (P4-8).

**Spec:** SRD §7.10 (FR-IN-1..31), E26–E29, NFR-PF-1. Benchmark: `docs/benchmarks/2026-11-08-indicator-engine.md`.

## Global Constraints
- Phase 0–3 constraints plus `AGENTS.md`.
- **One entry point.** REST, sockets, agent tools, alerts, scans and backtests all call `IndicatorService`. No runtime-specific endpoint, DTO or event (FR-IN-31).
- **TradingView semantics, not library defaults.** EMA is SMA-seeded; RMA is SMA-seeded; ATR is RMA of `ta.tr(true)`; Bollinger uses the population deviation; VWAP resets on its anchor in the instrument's timezone; Supertrend follows Pine's `ta.supertrend` (direction 1 on its first bar). A value is `null` exactly where Pine's is `na`.
- **Incremental.** A tick on the forming bar replaces the last input; a new bar adds one. Never recompute history for a tick (FR-IN-6).
- **Warm-up.** `compute` reads `limit + warm-up` bars (warm-up = max(500, 10 × the longest lookback), capped at 5,000 in total) and returns the last `limit`, so recursive indicators have converged (residual below 1e-9 relative for the defaults).
- **No database tables in P4-1..P4-5.** Presets, templates and scripts (P4-10) need migrations; they wait for the migration owner.

## Review Focus
1. **A tick arriving 50 times on one forming bar** leaves every indicator equal to a fresh full run (difference 0).
2. **Warm-up bars:** `null` exactly where TradingView/PineTS has `na`, never a library's early value (trading-signals' first-price EMA seed).
3. **Offset:** positive offsets never paint into the forming bar's future; negative offsets leave the newest bars empty.
4. **Out-of-order bar** (older than the last one) is rejected, never silently merged.
5. **Bars stale or closed:** the indicator result carries the bars' `status`, never a guess.

## Tasks
| Task | What | SRD |
|---|---|---|
| **P4-1** Contracts and catalog | `indicator.ts` contracts (definition, input defs int/float/bool/string/source, plots, levels, values, compute request, result, live update). Domain catalog for SMA, EMA, WMA, RSI, MACD, BB, ATR, Stoch, VWAP, Supertrend with TradingView's inputs, defaults and plot ids, each with its Pine source. `resolveInputs` (defaults, int/float/min/max, options, unknown keys rejected). `sourceValue`, `shiftByOffset`, `OffsetStream`, `warmupBars`. Tests: every definition parses with the contract; input errors name the input; offset ±k on batch and stream. | FR-IN-7, FR-IN-9, FR-IN-31 |
| **P4-2** Native runtime and parity | Kernels per built-in; `NativeRuntime.create(definition, inputs, context)` → instance with `seed(bars)` and `update(bar, replace)`. Fixtures: seeded random-walk bars (as the benchmark's `data.mjs`, crossing two sessions, with a zero-volume bar). Tests: each built-in, every MA type, equals PineTS running the built-in's own Pine source to 1e-9 on all bars, `null` on the same bars; hand-checked small cases (SMA of 1..5, RSI all-gains = 100). | FR-IN-2, FR-IN-6 |
| **P4-3** Service and REST | `IndicatorService.compute` (resolve, read bars with warm-up through `MarketDataService.bars`, run, offset, slice), `list`, `get`. `IndicatorsController`: `GET /api/v1/indicators`, `GET /api/v1/indicators/:ref` (`builtin:<id>@<version>`), `POST /api/v1/indicators/compute`. Rate limited like `/bars`. Tests: contract-valid bodies; 422 on bad inputs with the input's name; 404 on an unknown ref; `status` passes through; `pine` kind goes through the same endpoint. | FR-IN-31, FR-IN-1 |
| **P4-4** Incremental streams | `IndicatorService.open` → `{ result, stream }`; `stream.push(bar)` adds or replaces by bar time, rejects older bars, returns `{ barTime, values }` after offset. Tests: 50 ticks on a forming bar then a close equal a fresh full run; 10 default built-ins update in ≤ 5 ms on the forming bar after 5,000 bars. | FR-IN-5, FR-IN-6 |
| **P4-5** Live indicators | Socket `subscribeIndicators { subscriptionId, indicators[] }` on the live gateway, fed by the bar subscription it names; emits `indicator { instanceId, barTime, values, seq }` with the bar's `seq`; one shared instance per (instrument, interval, ref, inputs hash) ref-counted across sockets; a resync on the bar stream resets its indicators. Tests: socket client with fake Redis; two sockets share one instance; resync re-seeds. | FR-IN-5, FR-IN-30 |
| **P4-6** Pine runtime | PineTS 0.13.1 pinned, with the FR-IN-29 patch set via `patch-package` (no 1 s forming-bar throttle, push provider with `interval: 0`, one point per bar time, exchange prefix kept). Worker-thread pool: 256 MB, 5 s per run, a crashed worker replaced (E26). `stream()` always with `pageSize`; newest tick wins (FR-IN-30). `request.security` reads the candle store through `MarketDataService` (FR-IN-3): `NSE:X` and `BSE:X` give different data; no data → `na` plus a reason (E27). Unsupported features fail with line and feature (FR-IN-4). Tests: each patch; infinite loop killed and replaced while a native indicator keeps updating; every-tick latency p95 ≤ 10 ms for 6 indicators on 5,000 bars. | FR-IN-2..6, 29, 30, E26, E27 |
| **P4-7** TradingView reference fixtures | Captured TradingView outputs on real NSE bars (RELIANCE 1D, RSI, ATR, MACD, BB, EMA, then Supertrend, Stoch, VWAP), stored as a fixture and checked in CI to 1e-8 from bar 300. Licence of the captured values settled by the owner before commit. | FR-IN-2 |
| **P4-8** Chart overlay and settings dialog | Web: `useIndicatorSeries` (compute through TanStack Query, live through the indicator socket into `LiveStore`, never React state); plots as Lightweight Charts series on the price pane or a new pane; levels as price lines; the legend (name, inputs, values, hide, settings, remove); the settings dialog with the Inputs tab (int/float min-max-step, bool, options, source) and the Style tab (visible, colour token, width, line style, plot type, precision). | FR-IN-9, 10, 15, 16 |
| **P4-9** Indicator on indicator | `source` inputs accept another indicator's plot on the same chart; chains A → B → C across runtimes through the plot model; cycles rejected; a missing parent → "source unavailable" and recovery (E28). | FR-IN-13, E28 |
| **P4-10** Persistence | Tables and endpoints for defaults and named presets (FR-IN-12), templates with favourites (FR-IN-14), "My scripts" with versions and source hash (FR-IN-19, 28). Needs the migration owner. | FR-IN-12, 14, 19, 28 |
| **P4-11** Server-side indicator alerts | Conditions (FR-IN-21) evaluated in the market-data process from the same streams; once / once per bar / per bar close; idempotent delivery per (alert, bar); resume from the last evaluated bar (E29); late firing after repairs (FR-IN-23). | FR-IN-21..23, E29 |
| **P4-12** Pine editor and coverage report | Editor with highlighting, autocomplete, inline errors; the coverage table generated from tests; agent-written and imported Pine go through the same checks. | FR-IN-4, 19, 20, 25–28 |
| **P4-13** Rest of wave 1 | The remaining ~50 built-ins (anchored VWAP, pivots, Fibonacci, ZigZag, Ichimoku, volume profile, relative volume, correlation, relative strength, candlestick patterns, …), each with a parity test. | FR-IN-7 |

Each brief carries exact contracts and tests, as in Phases 1–3.
