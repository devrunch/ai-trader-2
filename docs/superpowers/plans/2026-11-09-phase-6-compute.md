# Phase 6 — Python Compute and Backtests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution model:** manager (Claude) → employee per `docs/process/WORKFLOW.md`; one brief per task in `docs/tasks/P6-<n>.md`.

**Goal:** Node can backtest a declarative strategy over engine series through a private, stateless Python service, with a typed client that cannot drift from the service.
- **Stateless:** request in, result out. No database, no vendor calls, no credentials, no scheduler, never calls Node (SRD §10.2, NFR-SC-4).
- **Deterministic:** the same request gives the same response, byte for byte.
- **Pessimistic:** the fill rules of FR-BT-2 are built in, not options.

**Architecture:**
- **Service:** `services/compute/` — FastAPI on Python 3.13, Pydantic v2 models, NumPy for the maths; `uv` with a lockfile; ruff, mypy `--strict`, pytest.
- **Contract:** the service's OpenAPI document is dumped to `packages/compute-client/openapi.json`; `@aitrader/compute-client` is generated from it (types and Zod schemas) plus a thin `fetch` wrapper with a timeout. A check regenerates and fails on any diff (§10.2 "CI fails if they differ").
- **Node:** `apps/api/src/modules/compute/` — an application port `ComputeGateway` and an infrastructure adapter on the generated client, with timeout, retry and a circuit breaker from `@aitrader/resilience`. An open breaker or a dead service reports `UNAVAILABLE` for backtests only (E21).
- **Indicators are not computed in Python.** The caller sends the engine's series (FR-IN-1, §10.2: "They no longer compute indicators themselves"). Bars' own fields (`open`, `high`, `low`, `close`, `volume`) are always available as series.

**Spec:** SRD §10.2, §7.9 (FR-BT-1, FR-BT-2), §11 (Compute), NFR-OB-1, NFR-SC-4, NFR-RB-2/3, E21.

## Global Constraints
- Phase 0–5 constraints plus `AGENTS.md`.
- **Exact pins** in `pyproject.toml` and `package.json`; releases at least 14 days old (`[tool.uv] exclude-newer`).
- **Wire format is camelCase** (Pydantic alias generator), matching `@aitrader/contracts`. Bar `time` is epoch milliseconds, as in `BarSchema`.
- **Error bodies** are `{ code, message, details?, requestId }` with codes from `ERROR_CODES`.
- **Bounded work:** request body ≤ 16 MiB, ≤ 100 000 bars, ≤ 32 series, condition tree ≤ 64 nodes and depth ≤ 8, a wall-clock limit per request (default 10 s) checked cooperatively inside the engine.

## Backtest rules (FR-BT-2; the manager reviews these)
1. **Decisions at bar close, fills at the next bar's open.** A condition true at the close of bar *i* fills at the open of bar *i+1*. A signal on the last bar is ignored.
2. **One position at a time**, long or short per spec; no pyramiding. Size = `positionFraction` × equity at the entry fill (default 1.0, fractional units allowed).
3. **Stop and target are fixed at entry**, as a percent of the entry fill or as `multiple × series[i]` (for example an ATR series) read at the decision bar.
4. **Within a bar, the stop is checked before the target.** A bar that opens through the stop fills at the open; otherwise at the stop. A bar that opens through the target fills at the open; otherwise at the target.
5. **Exit signal:** true at the close of bar *j* (with *j* ≥ the entry bar) exits at the open of *j+1*. Stop and target on bar *j+1* are checked only after that open fill, so the exit signal wins on that bar.
6. **Re-entry** is decided only while flat at a bar's close; exiting and re-entering on the same open never happens.
7. **End of data:** an open position closes at the last bar's close, reason `endOfData`.
8. **Costs, full round trip:** `commissionPct` and `slippagePct` apply to every fill (entry and exit). Slippage moves the fill price against the trade; commission is charged on the fill's notional.
9. **Warm-up:** a `null` series value is *unknown*. Conditions use three-valued logic (`not unknown` is unknown), and only *true* fires a signal.

## Metrics (the manager reviews these)
| Metric | Definition |
|---|---|
| `totalReturnPct` | `(finalEquity / initialCapital − 1) × 100` |
| `cagrPct` | `((finalEquity / initialCapital)^(1 / years) − 1) × 100`; `years` = (last bar time − first bar time) / 365.25 days; `null` if `years` = 0 |
| `maxDrawdownPct` | largest peak-to-trough fall of the close-marked equity curve, as a positive percent of the peak |
| `sharpe` | annualised, risk-free rate 0: `mean(r) / std(r, ddof=1) × √(barsPerYear)`, `r` = per-bar simple returns of the equity curve, `barsPerYear` = (bars − 1) / `years`; `null` if fewer than 3 bars or `std` = 0 |
| `winRatePct` | trades with net P&L > 0 ÷ trades × 100; `null` with no trades |
| `profitFactor` | gross net profit ÷ |gross net loss|; `null` with no losing trade |
| `exposurePct` | bars held (sum of exit bar index − entry bar index) ÷ bars × 100 |
| `tradeCount`, `finalEquity` | as named |

**Out-of-sample split (FR-BT-2):** an optional `outOfSampleFraction` (0.1–0.5) splits at bar `floor(n × (1 − f))`. The response carries `inSample` and `outOfSample` metric blocks; a trade belongs to the segment its entry fill is in; each segment's equity curve is rebased to its first bar. **Variants tried** is counted by Node, which owns state; Python only computes.

## Review Focus
1. **No lookahead:** no fill uses a value from the bar it was decided on, and the stop distance uses only data known at the decision bar.
2. **Gap fills and stop-before-target** match the hand-computed fixture exactly.
3. **Unknown series values** never fire a signal, including under `not`.
4. **A slow or dead service** degrades backtests only (E21); the breaker returns at once when open.
5. **The committed client equals a fresh generation** from the service.

## Tasks
| Task | What | SRD |
|---|---|---|
| **P6-1** Service skeleton | `services/compute`: `uv` project (Python 3.13, exact pins, lockfile), `create_app(limits)`, `GET /health` → `{ "status": "ok" }`, JSON logs (`ts`, `level`, `msg`, `requestId`, `method`, `path`, `status`, `durationMs`; no bodies), `x-request-id` accepted or generated and echoed, body-size limit → 413, error handlers → `{ code, message, details?, requestId }`; ruff + mypy strict + pytest | §10.2, NFR-OB-1 |
| **P6-2** Condition DSL | Pydantic discriminated unions: `{kind:"all"|"any", of:[…]}`, `{kind:"not", of}`, `{kind:"compare", left, op, right}`; operands `{kind:"series", name, offset}` / `{kind:"value", value}`; ops `gt gte lt lte eq neq crossesAbove crossesBelow`; unknown fields rejected; node and depth caps; three-valued NumPy evaluation | FR-BT-1 |
| **P6-3** Backtest engine | `POST /compute/v1/backtest`: bars + series + strategy + costs → trades, equity curve, metrics, optional in/out-of-sample blocks; rules and metrics above; a cooperative deadline → 504 `UNAVAILABLE`; tests include a hand-computed 8-bar backtest, gap-through-stop, stop-before-target, short side, costs, warm-up, lookahead and determinism | FR-BT-1/2 |
| **P6-4** Generated client | `packages/compute-client`: `openapi.json` dumped from the app without a server, types and Zod schemas generated, `createComputeClient({ baseUrl, fetch? }).backtest(body, { signal, timeoutMs })` parsing the response; `pnpm generate:compute-client` and `pnpm check:compute-client` (regenerate, `git diff --exit-code`) | §10.2, §11 |
| **P6-5** Node adapter | `apps/api/src/modules/compute/`: port `ComputeGateway.backtest(req, signal) → { ok: true, data } | { ok: false, reason: 'UNAVAILABLE' | 'INVALID' }`, an adapter on the generated client with `withTimeout`, `retry` (transport errors and 503 only, never 4xx) and `CircuitBreaker`; no controller yet | E21, NFR-RB-2/3 |
| **P6-6** Repo wiring | `pnpm check:python` (ruff, mypy, pytest); included in `check:code` if it runs in under 60 s; run instructions in `services/compute/README.md` | NFR-QL-2 |
| **P6-7** Later (not in this pass) | Backtest controller with per-user rate limit (NFR-SC-5), variants-tried counter, Docker image and private networking with IAM or mTLS (NFR-SC-4), the remaining compute endpoints (`conditions`, `evaluate`, confluence), porting the old Python tests that carry over (NFR-QL-3) | §11, NFR-SC-4/5 |

Each brief carries exact contracts and tests, as in Phases 1 to 3.
