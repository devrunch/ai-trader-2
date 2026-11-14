# GAP: SRD requirements against what is built (2026-11-12, origin/main 58bf795)

Method: `docs/TODO.md`, `docs/tasks/*.result.md` and file/keyword checks. Test files were not all read, so "done" means the feature exists with tests named in the task results, not that every SRD sub-clause was re-verified. Owner decisions applied: deploy is Coolify (not ECS/CloudFront), compute on Lambda, Telegram and ops dashboards deferred, the assistant trades paper only (SRD D13 is overridden), Gemini model, Mastra kept.

Status: **done** / **partial** / **missing** / **dropped** (dropped-by-owner).

Removed by owner 2026-11-12 (no longer tracked here):
- FR-NT-2 Telegram linking and opt-in alerts.
- NFR-OB-4 ops dashboards and alarms.
- NFR-OB-2 OpenTelemetry, NFR-OB-3 Sentry.
- NFR-RB-8 zero-downtime (rolling or blue-green) deploys.
- Architecture diagram regeneration.

## Functional

| ID | Requirement | Status | Evidence / what is absent |
|---|---|---|---|
| FR-SY-1 | One canonical `EXCHANGE:TICKER` id | done | P1-1, P1-4; `shared/vendors` adapters only |
| FR-SY-2 | Instrument master with symbol-info fields | done | `shared/database/schema/instruments.ts` (lotSize, pricescale…); P1-1 |
| FR-SY-3 | Provider mappings as data | done | P1-4, P1-5 |
| FR-SY-4 | Daily refresh with change history | done | P1-5 (E22/E23) |
| FR-SY-5 | Continuous futures, visible roll | partial | P1-1/P2-10a resolve `1!`; no roll marker on chart, no back-adjusted option |
| FR-SY-6 | Fuzzy search, aliases, filters, <100 ms | done | P1-6, P1-7 |
| FR-SY-7 | Validate at the edge, 404 + suggestions | done | `resolve-instrument.ts` (+spec) |
| FR-SY-8 | Corporate actions (adjusted + raw history) | missing | no split/bonus handling anywhere |
| FR-SY-9 | Migrate data from `ai-trader` | missing | no migration code; Q5 not recorded as decided |
| FR-UI-1 | Professional terminal layout | done | `app/layout/terminal-layout.tsx` |
| FR-UI-2 | Pages: Home, Terminal, Portfolio, Strategies, Alerts, Settings, Admin | partial | routes only Home, Terminal, Admin, Login; Portfolio/Alerts are terminal panels; no Strategies or Settings page |
| FR-UI-3 | Market-neutral, own-currency formatting | done | `terminal/format.ts`, P5-9 |
| FR-UI-4 | Dark/light, follows system | done | `shared/ui/theme-toggle.tsx` |
| FR-UI-5 | Phone single column with bottom sheet | partial | UI-3/UI-4 phone fixes; "fuller phone pass" open in TODO |
| FR-UI-6 | Loading states | done | P1-7 and per-feature skeleton states |
| FR-UI-7 | Empty/error states say why | done | P3-3, P3-5; per-panel states |
| FR-UI-8 | Always-visible connection status | done | `chart/connection-indicator.tsx` |
| FR-UI-9 | Keyboard: search on any key, interval keys, Esc | partial | P1-7 search; interval shortcuts not confirmed |
| FR-UI-10 | WCAG AA, keyboard reachable | partial | aria labels throughout; no contrast audit or a11y test |
| FR-CH-1 | Lightweight Charts v5; candles, HA, Renko, Kagi, P&F, footprint | partial | `lwc-chart.ts` candles/line/area only; no HA/Renko/Kagi/P&F/footprint chart types |
| FR-CH-2 | Indicators from the engine | done | P4 series |
| FR-CH-3 | Multi-chart layouts 1-8 with sync | missing | no layout/multi-chart code |
| FR-CH-4 | Drawings and layouts saved per user and symbol | partial | P3-5 drawings; chart layouts not saved |
| FR-CH-5 | Scroll-back by cursor | done | P2-3 |
| FR-CH-6 | Intervals, server aggregation on session grid | done | P2-1, P2-3 |
| FR-CH-7 | Bar replay, no lookahead | done | P11-1 (`replay-controls.tsx`) |
| FR-CH-8 | Second intervals 1S-30S | done | P11-2 |
| FR-MD-1 | Providers: Kite, Deriv, US | partial | Kite + US delayed (Yahoo) done; Deriv/forex absent (FX only via calendar) |
| FR-MD-2 | Candle store, repairs, retention | done | P2-1, P2-4, P2-5; `retention.job.ts` |
| FR-MD-3 | Kite session renewed by scheduled login | partial | auto-login built (P2-10c) but fails from the Coolify IP (T12); manual daily connect |
| FR-MD-4 | Kite limits respected | done | P2-4 shared limiter, `subscription-manager.ts` |
| FR-MD-5 | Subscribe on demand, 60 s grace | done | P2-5, P2-10a |
| FR-LS-1 | Socket.IO, one connection per tab, same auth | done | `shared/live/live-connection.ts`, `modules/live` |
| FR-LS-2 | Snapshot then numbered updates | done | `live-subscriptions.ts`, `read-seq.ts` |
| FR-LS-3 | Gap detection and `since=` resync | done | `live-client.ts`; P3-3 (real sleep/wake open: T2) |
| FR-LS-4 | Idempotent merge | done | P2-3 (E11) |
| FR-PT-1 | Paper accounts per user, own currency | done | P5-9 |
| FR-PT-2 | Order types, SL/target, gap fills | done | P5 |
| FR-PT-3 | Idempotent `clientOrderId` | done | `schema/paper.ts` unique index |
| FR-PT-4 | Risk limits fail closed | done | `paper-trading/domain/risk.ts` |
| FR-PT-5 | Intraday square-off, restart-safe | done | `square-off.ts`, `paper-jobs.registration.ts` |
| FR-PT-6 | Realistic costs | done | P5-8/9; T5 (rates re-check) |
| FR-PT-7 | Agent reads account; cannot trade | dropped | owner 2026-11-10: the assistant may place/cancel/close PAPER orders (P7-1 tools); no broker path |
| FR-AG-1 | Mastra runs the agent | done | `agent/infrastructure/mastra-runner.ts` |
| FR-AG-2 | Models with fallback per task | partial | `models/model-factory.ts` (Gemini + Bedrock); fallback chain not confirmed per task |
| FR-AG-3 | Per-turn budget, per-user daily cap | partial | `turn-budget.ts`; admin-editable daily cap not found |
| FR-AG-4 | No orders, no broker access | dropped | superseded by paper-only rule; broker unreachable from agent code |
| FR-AG-5 | Guarded read functions | done | all agent tools listed in the system prompt (tool-guide spec) and tested per asset class; `scanUniverse`, `getDepth`, `getFundamentals`, `getEventScorecard`, `getSentiment`, `getCrowd`, `webSearch`, `getMarketStatus` (AG-10) |
| FR-AG-6 | Numbers come from tools | done | server-computed drawings and levels; `calculate` tool |
| FR-AG-7 | Agent code never runs on server | done | declarative specs; Pine only in sandboxed pool |
| FR-AG-8 | Streaming chat with tool cards | done | `chat/message-parts.tsx`, P7 |
| FR-AG-9 | Threads and working memory | done | `agent-memory.ts`, P7-9, `threads.ts` |
| FR-AG-10 | Skills in SKILL.md format | partial | 13 `skill-*.md` prompt skills with `listSkills/useSkill`; not Agent-Skills/Workspace format, no `skill_search` |
| FR-AG-11 | Vendored skill sources at pinned commits | partial | day-trader skills adapted (P8-1); AG-1 packs pinned; AG-10 market skills (macro-fx-carry, event-surprise-playbook, commodities-crude-gold, crypto-24x7, us-earnings, india-fno-expiry, india-gap-playbook, screener-ideas, risk-atr-correlation) are our own, no upstream; `listSkills` groups by market |
| FR-AG-12 | Broker skills removed | done | none present |
| FR-AG-13 | Skill data via guarded functions | done | skills call the same tools |
| FR-AG-14 | Skill scripts in isolated sandbox | missing | no AgentCore/sandbox; skills are prompts + `calculate` only |
| FR-AG-15 | Admin enables skills; runs record version | missing | no admin skill toggle found |
| FR-AG-16 | Honest output: sample size, costs, drawdown | partial | P8-1 risk gate and prompts; backtest outputs from Lambda; not systematically enforced |
| FR-AG-17 | Every write is a confirmed action card | done | `action-cards.ts`, P7-10 |
| FR-HM-1 | Twice-daily market overview | partial | P9-6 pre-market brief; no US-open brief, no global-cues bias |
| FR-HM-2 | Headlines deduped, clustered, LLM-scored | partial | news ingest + dedupe + rule-based impact (P9-8); no clustering, no LLM scoring (owner chose rules) |
| FR-HM-3 | Market alerts, Reddit/crowd sentiment | missing | no sentiment or sharp-move feed |
| FR-EV-1 | Event agenda from dated sources | partial | calendar (ForexFactory weekly + India RBI/MoSPI P9-7); no BLS/BEA/EIA/NSE results |
| FR-EV-2 | Event watcher | missing | none |
| FR-EV-3 | Scorecard of predictions | missing | none |
| FR-NT-1 | In-app bell and feed | done | P9-2 `features/notifications` |
| FR-NT-3 | Ops alerts by email only | done | Resend (P3-8, T4) |
| FR-AC-1 | Email+password and Google, rotating refresh | partial | P2-10b email/password sessions; no Google sign-in; session cookie model, rotation not confirmed |
| FR-AC-2 | Admin: users, usage/caps, skills, job and provider health | partial | `admin-ops` provider/job health, prompts, Zerodha card; no users/usage/caps/skills UI |
| FR-BT-1 | Strategy specs and backtests | partial | P6 `runBacktest` via Lambda; no Strategies page, no stored strategies |
| FR-BT-2 | Pessimistic fill rules | done | P6 (compute service) |
| FR-IN-1 | One engine for all callers | done | `IndicatorService` used by chart, agent, alerts, backtest |
| FR-IN-2 | Two tiers, one set of numbers | done | native + Pine runtimes, benchmark doc |
| FR-IN-3 | Real data for `request.security` | done | `pine/market-candle-source.ts` (E27) |
| FR-IN-4 | Pine coverage table, line-numbered errors | done | P4-6, `pine-coverage.ts` |
| FR-IN-5 | Live recompute per tick or on close | done | P4 live indicator socket |
| FR-IN-6 | Incremental computing, 10 indicators budget | partial | stateful instances; `pine-latency.spec.ts`; budget measured in tests only |
| FR-IN-7 | Built-in library in two waves | done | 53 built-ins (P4-13a/b) |
| FR-IN-8 | Formula and compare series | missing | no formula/compare feature |
| FR-IN-9 | Inputs tab, widget per input type | done | `indicators/inputs-tab.tsx`, `fields.tsx` |
| FR-IN-10 | Style tab per plot | done | P4-8b |
| FR-IN-11 | Visibility tab per timeframe | done | P4-8b |
| FR-IN-12 | Defaults, reset, named presets | done | P4-10 |
| FR-IN-13 | Indicator on indicator, chains | done | P4-9 (E28) |
| FR-IN-14 | Templates | done | P4-10 |
| FR-IN-15 | Legend and data window | partial | `indicator-legend.tsx`; separate data window not confirmed |
| FR-IN-16 | Panes: reorder, merge, maximise, collapse, saved heights | missing | no pane management |
| FR-IN-17 | 25 indicators / 5,000 bars budget | partial | `pine-latency.spec.ts`; no browser render measurement |
| FR-IN-18 | CSV export of visible range | missing | none |
| FR-IN-19 | Pine editor | done | P4-12 |
| FR-IN-20 | Agent Pine: compiler check + sample run before attach | partial | P7-10 describes (compiles) before proposing; no sample-bar test run |
| FR-IN-21 | Alert conditions on indicators | done | P9-5 |
| FR-IN-22 | Server-side alert evaluation | done | P9-4/5 |
| FR-IN-23 | Alert recovery after outage | partial | not confirmed in alerts code; E1 repairs exist |
| FR-IN-24 | Agent adds/removes indicators, reads values | done | `getIndicator`; `proposeChartAction` adds, removes (`remove-indicator`) and changes inputs (`set-indicator-inputs`) via cards (AG-10) |
| FR-IN-25 | Paste code or link into chat | done | P7-10 `proposePineScript` |
| FR-IN-26 | Checked before offered (compile, coverage, test run) | partial | compile + coverage errors shown; no sample-bar run |
| FR-IN-27 | Action card, then modal; never saves alone | partial | action card done; no modal (card applies directly) |
| FR-IN-28 | Duplicate by source hash: "already saved" | partial | hash stored (`script-hash.ts`); card does not detect an existing script |
| FR-IN-29 | Maintained PineTS patch set | done | `pinets-patches.spec.ts`, P4-6 |
| FR-IN-30 | Sharing and backpressure for live Pine | done | P4-6 (E26) |
| FR-IN-31 | One wrapper over both runtimes | done | `RuntimeResolver` |

## Non-functional

| ID | Requirement | Status | Evidence / what is absent |
|---|---|---|---|
| NFR-RB-1 | Every connection self-recovers | done | T-008/T-009, `@aitrader/resilience`; real network drop open (T11) |
| NFR-RB-2 | Circuit breaker per vendor | done | `CircuitBreaker`, P1-3 |
| NFR-RB-3 | Timeouts and cancellation | done | T-008; AGENTS §2 enforced in review |
| NFR-RB-4 | Idempotency | done | P1-2, P1-5, P2-10a |
| NFR-RB-5 | Durable jobs | done | `shared/jobs/job-scheduler.ts`, heartbeat (E22) |
| NFR-RB-6 | Honest `/health` and `/ready` | done | T-007, T-009; `health.controller.spec.ts` |
| NFR-RB-7 | Graceful shutdown | partial | `main.ts` shutdown hooks; 20 s drain and reconnect hint not confirmed |
| NFR-PF-1 | Chart load/render budgets | partial | no measured numbers recorded |
| NFR-PF-2 | Older-history page ≤ 800 ms p95 | partial | P2-3 designed to it; no recorded measurement |
| NFR-PF-3 | Tick to paint ≤ 300 ms p95 | partial | T-011 harness; real session pending (T1) |
| NFR-PF-4 | SWR cache, idle prefetch | partial | TanStack Query in place; idle prefetch of watchlist not found |
| NFR-PF-5 | Shell bundle ≤ 250 KB gz, split chunks | partial | P1-7 split; no size gate in CI |
| NFR-PF-6 | First token ≤ 2.5 s p95 | partial | no measurement recorded |
| NFR-SC-1 | Secrets in Secrets Manager | dropped | Coolify env vars (owner deploy decision); T-005/T-006 keep secrets out of repo |
| NFR-SC-2 | Sandbox: no network, no credentials | partial | Pine pool is isolated; skill sandbox missing (FR-AG-14) |
| NFR-SC-3 | SSRF guard for agent web fetch | partial | guard exists for Pine links only (`pine-source.ts`); no general web fetch |
| NFR-SC-4 | Compute private, IAM-authenticated | done | `sigv4-fetch.ts`, P6 (Lambda) |
| NFR-SC-5 | Per-user rate limits on expensive endpoints | partial | `ip-rate-limit.guard.ts`, indicator and tool limiters; chat/backtest/scan coverage not confirmed |
| NFR-OB-1 | Structured logs, request id across services | partial | `observability/request-id.ts`; propagation to Lambda compute not confirmed |
| NFR-QL-1 | Strict TS, no `any` | done | lint-enforced (T-002) |
| NFR-QL-2 | Coverage gates; test per §9 row | partial | gates enforced (T-003/4); not every E-row has a named test (see below) |
| NFR-QL-3 | Carry over ~279 Python tests | partial | `services/compute` tests exist (P6); count not reconciled |

## §9 failure modes

| ID | Failure | Status | Evidence / what is absent |
|---|---|---|---|
| E1 | Kite ws drop: reconnect, backfill, mark repaired | done | P2-5, P2-6 |
| E2 | Silent half-open ws (30 s watchdog) | done | P2-6 (feed supervisor) |
| E3 | Kite token expired / login failed | partial | P2-4, OPS-2 stores last failure; auto-login blocked by IP (T12) |
| E4 | Kite 429: shared limiter | done | P2-4 |
| E5 | Deriv ws drop | dropped | no Deriv provider built |
| E6 | Vendor down: breaker + stale flag | done | P1-3, P2-6 |
| E7 | Browser socket drop: reconnect + resync | done | `live-client.spec.ts` (real laptop sleep: T2) |
| E8 | Background tab resync | done | `live-client.ts` visibilitychange |
| E9 | Offline then online: queued UI saves retry | partial | no queued-save mechanism; orders fail clearly |
| E10 | Sequence gap: resync per instrument | done | `live-subscriptions.spec.ts` |
| E11 | Duplicate/out-of-order ticks | done | P2-1, P2-3, P2-5 |
| E12 | Tick on bar boundary | done | P2-1, P2-3 |
| E13 | Pre-open, holidays, half days, Muhurat, DST | partial | P3-7 calendars; Muhurat 2027 and 2027 holidays pending (T8, T9) |
| E14 | Client clock wrong | partial | P3-3 listed; offset handling not found in client |
| E15 | Symbol switch cancels in-flight request | done | P3-3 (query keys, abort) |
| E16 | Server restart rebuilds forming bars | done | P2-1, P2-3, P2-5 |
| E17 | Database down: `/ready` fails, fast write errors | done | T-009, T-012 |
| E18 | Redis down: local fallbacks | done | T-009, T-012 |
| E19 | Bedrock throttled: fallback model | partial | model factory has fallbacks; throttle test not confirmed |
| E20 | Skill sandbox timeout | missing | no skill sandbox |
| E21 | Compute down: features report unavailable | done | P6 |
| E22 | Job missed/hung: catch-up, kill, heartbeat email | done | P1-2, P1-5, P1-FIX1 |
| E23 | Instrument renamed/delisted/expired | done | P1-1, P1-4, P1-5, P1-6 |
| E24 | Multiple tabs: per-tab sockets, no duplicate alerts | partial | per-tab sockets; alert dedupe across tabs not confirmed |
| E25 | Deploy in market hours: no skipped jobs | partial | P1-2 catch-up; single instance, so a deploy restarts the API (rolling deploy removed by owner) |
| E26 | Pine runaway/crash: kill and replace | done | P4-6, `pine-runtime.spec.ts` (flaky under load) |
| E27 | `request.security` without data: `na` + reason | done | P4-6 |
| E28 | Indicator chain with failing parent | done | P4-9 |
| E29 | Alert engine restart resumes from last bar | partial | not confirmed |
| E30 | Indicator link cannot be fetched: card says why | partial | `pine-source.ts` limits tested; failure shows as a tool error, not a card with "paste the code" |
| E31 | Action card confirmed after restart/expiry | done | cards persisted with 15 min TTL (`action-card.ts`) |
| E32 | Prompt injection in pasted text is data | partial | Pine text only reaches the compiler; no specific injection test |

## §17 acceptance

| ID | Bullet | Status | Evidence / what is absent |
|---|---|---|---|
| AC-1 | Every FR/NFR has a passing test or recorded measurement | partial | see table; measurements missing for NFR-PF-* |
| AC-2 | Every §9 row has a failure-simulation test | partial | rows marked partial/missing above |
| AC-3 | Full NSE day on staging with forced ws drop, browser disconnect, deploy; zero missing 1-minute bars | missing | T1, T2, T11 pending; no staging |
| AC-4 | Security review: sandbox no network/credentials; agent has no order path | partial | no broker path by design; no formal review; skill sandbox missing |
| AC-5 | Chart, agent, alert, backtest report the same value per built-in | partial | one engine; no cross-surface equality test; TradingView parity fixtures pending (T10) |

## Summary

1. Counts (162 rows after 5 owner removals): done 88, partial 57, missing 13, dropped 4.
2. Missing 1: FR-AG-14/E20, skill scripts in an isolated sandbox (the SRD's safety story for skills).
3. Missing 2: AC-3 staging day with forced drops and a zero-gap check, plus T1/T2/T11 real-session tests.
4. Missing 3: FR-CH-3 multi-chart layouts and FR-CH-4 saved layouts.
5. Missing 4: FR-CH-1 chart types (Heikin Ashi, Renko, Kagi, Point & Figure, footprint) and FR-IN-16 pane management.
6. Missing 5: FR-SY-8 corporate actions (adjusted history), and FR-SY-9 migration of old data.
7. Missing 6: FR-AC-1 Google sign-in and FR-AC-2 admin users/usage/caps/skill toggles (FR-AG-15).
8. Missing 7: FR-EV-2/3 event watcher and scorecard, FR-HM-3 market/sentiment alerts, FR-IN-8 formula/compare, FR-IN-18 CSV export.
9. Also open: T12 Kite auto-login from the Coolify IP (manual daily connect until fixed), FR-BT-1 Strategies page, FR-UI-2 Portfolio/Settings pages, and NFR-PF-* measurements.
10. Owner priority 2026-11-12: agent, news, events (FR-AG-10/11/14/15, FR-HM-*, FR-EV-*) come first.
