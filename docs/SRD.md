# AI Trader 2 — Software Requirements Document

| | |
|---|---|
| Version | 0.1 (draft for owner review) |
| Date | 2026-11-08 |
| Owner | QMiNt |
| Replaces | `ai-trader` (three submodules: `ai-trader-api`, `ai-trader-signals`, `ai-trader-frontend`) |
| Builders | Codex CLI writes the code; Claude writes the rules (`AGENTS.md`) and reviews every change against them |

Requirement IDs (`FR-…`, `NFR-…`, `R-…`) are stable, so tasks, tests and reviews can cite them. **Owner decision** means the owner said it. **Builder's call** means it was chosen during design and the owner can still overturn it. Section 15 lists every builder's call in one place.

---

## 1. Purpose

AI Trader 2 is a web trading terminal with an AI analyst built in. A trader opens a chart, reads what the market and the news are doing, asks the agent questions, and tries ideas with simulated money against real prices.

It is a rebuild, not a patch. The current system works, but:
- ownership is split across three services that call each other in both directions;
- schedules and workflows are split across two languages;
- user data sits in Redis, which is used as a database;
- the Nest code has no repository layer, no error model and loose types;
- charts show gaps and load slowly;
- symbols are a bare string plus a separate exchange field, with each data provider's own format leaking through about 20 files.

AI Trader 2 keeps the product and the hard-won rules (pessimistic backtests, risk gates that fail closed, all numbers coming from real data) and rebuilds the structure.

## 2. Owner decisions

Everything the owner has stated for this rebuild. Each item traces to the requirements that implement it.

| # | Owner decision | Where |
|---|---|---|
| D1 | Build from scratch in a new folder, `ai-trader-2`. Drop everything that isn't used. | §13 |
| D2 | Backend in Node.js only, with a strict Java-Spring-style layered, object-oriented architecture. | §10.1, R-1 to R-12 |
| D3 | Python stays only as services behind APIs; all business logic lives in Node. | §10.2 |
| D4 | The current Nest code doesn't meet enterprise quality and must not be carried over as-is. | §10.1 |
| D5 | Frontend in React, light. | §10.3 |
| D6 | A new, good UI, not the current one. | §6 |
| D7 | Charts must never show gaps, loading must be good, and the system must be as robust as possible: every connection drop handled, self-recovery everywhere. | §8, §9 |
| D8 | The robustness rules go into the coding rules. Codex codes, Claude checks against the rules. | §14 |
| D9 | The agent is built on Mastra (TypeScript), not on a hand-built loop. | FR-AG-1 |
| D10 | The agent serves the trading skills from `daytrader.md` (Jake Schincariol's `day-trader-skill`, ankurgoels' `trader-skills-india`) and from `tradermonty/claude-trading-skills`. | FR-AG-10 to FR-AG-15 |
| D11 | Any AWS service may be used. | §10.5 |
| D12 | Zerodha (Kite Connect) is the market data source for India. | FR-MD-1 |
| D13 | **The agent places no orders and gets no Zerodha access.** It gets guarded functions that read data. | FR-AG-4, FR-AG-5 |
| D14 | Paper trading stays. | FR-PT-* |
| D15 | Symbol mapping works like TradingView. | §5 |
| D16 | Carried over from earlier sessions: a market-neutral UI (global, not India-first); ops alerts by email only; Telegram is a per-user feature. | FR-UI-3, FR-NT-* |
| D17 | A full indicator engine with custom settings, matching TradingView's premium indicator features, not the small library there is today. | §7.10 |
| D18 | When the user shares an indicator link or code with the agent, the agent offers to save it, through action cards and modals. | FR-IN-25 to FR-IN-28, FR-AG-17 |

## 3. Users and what they need

**Primary user: the active trader.** Trades intraday and swing across Indian equities, indices and commodities, and watches forex, metals and US stocks. Wants TradingView-grade charts, fast answers and honest numbers.

**Secondary user: the admin** (the owner). Manages users, usage caps and system health.

What the trader needs, in their own terms:

| Need | What it means for the product |
|---|---|
| N1 · "Know before the market opens" | A pre-market brief: overnight US and Asia, oil, gold, the dollar and major events, condensed into a view of the day. |
| N2 · "Hear about it first" | Alerts for market-moving news and scheduled releases (CPI, PPI, Fed, RBI), with what each is likely to move and in which direction. Delivered in the app and on Telegram. |
| N3 · "A chart I can trust" | No gaps, no wrong prices, no frozen candles. A loading or empty chart always says why. |
| N4 · "Fast" | Switching symbol or interval feels instant; the first chart paints in under a second on a warm cache. |
| N5 · "Ask the chart" | An agent that reads the chart, data, news and the user's paper portfolio, runs the trading skills, and answers with numbers that come from tools. |
| N6 · "Try it without risking money" | Paper trading with real prices, risk limits and an intraday square-off. |
| N7 · "Tell me when it's not worth it" | Every performance figure shown with costs, drawdown and sample size. The agent says when a setup is a coin flip. |
| N8 · "Every market in one place" | One search finds NSE, BSE, MCX, forex, metals and US stocks, with TradingView-style symbols. |
| N9 · "It just keeps working" | Dropped connections, expired broker logins and restarts recover by themselves, without a page reload. |

## 4. Scope

**Goals**
- G1 · Everything the current product does that is in use, rebuilt on the new structure (§13 lists what carries over).
- G2 · Gap-free, self-healing charts and live data.
- G3 · A Mastra agent with the skill packs, guarded data access and an isolated sandbox.
- G4 · A canonical symbol model like TradingView's.
- G5 · An enforced layered architecture: the layer rules are checked in CI, not left to convention.
- G6 · A new UI.

**Non-goals (this release)**
- Real-money order placement of any kind, by anyone, including the user through the UI.
- Crypto charting, mutual funds, real estate, personal allocation advice (all still on the long-term vision list).
- A trained signal model, or publishing trade signals as recommendations.
- Live US prices (US stays delayed unless a US data source is bought; see Q3).

**Anti-goals (would count as failure even if everything technically works)**
- The agent or any skill script able to reach Zerodha credentials, the database, or the open internet from the sandbox.
- A chart that silently shows wrong or missing candles.
- A performance number shown without its risk context.
- Business logic duplicated in two languages, which is how the current backtest and VWAP figures drifted apart.
- A layer rule that exists only in a document and isn't checked.

## 5. Symbol and instrument model (TradingView-style)

### 5.1 Problem today
- Every layer passes `symbol` and `exchange` separately, and three layers default `exchange` to `NSE`, so gold gets requested from the Indian equity exchange.
- Each vendor's format leaks across the codebase: Yahoo `^NSEI`, `.NS`, `=X`, `GC=F`; Deriv `frx…`; Kite tradingsymbols; continuous `GOLD1!`. About 20 files are affected.
- One shared regex has to accept every vendor's format at once.
- The data provider is guessed from the symbol at runtime.

### 5.2 Requirements
- **FR-SY-1 · One canonical ID.** Every instrument has one ID in the form `EXCHANGE:TICKER`, exactly as TradingView writes it: `NSE:RELIANCE`, `BSE:RELIANCE`, `NSE:NIFTY`, `NSE:BANKNIFTY`, `MCX:GOLD1!`, `NSE:NIFTY241128C24000`, `FX:EURUSD`, `OANDA:XAUUSD`, `NASDAQ:AAPL`, `NYSE:IBM`. This is the only symbol format used in the API, the database, the UI, URLs, the agent and the skills.
- **FR-SY-2 · Instrument master.** A table with one row per instrument:
  - `id` (canonical), `exchange`, `ticker`, `description`;
  - `type`: `stock`, `index`, `futures`, `option`, `forex`, `metal`, `commodity`, `etf`, `bond`;
  - `currency`, `timezone`, `session` (with holidays and special sessions);
  - `pricescale` and `minmov` (tick size), `lotSize`;
  - `expiry`, `strike`, `optionType`, `underlying` (derivatives);
  - `isin`, `sector`;
  - `hasIntraday`, `supportedResolutions`, `volumeType` (real, tick or none);
  - `status`: active, suspended or delisted.

  These are the fields of TradingView's symbol info.
- **FR-SY-3 · Provider mappings as data, not code.** A separate table maps a canonical ID to each provider's own symbol and token, for example `NSE:RELIANCE` to Kite token `738561`, and `OANDA:XAUUSD` to Deriv `frxXAUUSD`. Provider codes and formats exist **only** inside that provider's adapter and this table.
- **FR-SY-4 · Daily refresh.** The master is rebuilt every day from Kite's instrument dump, plus the Deriv and US lists, before the pre-open. Renames, new listings, delistings and expired contracts are recorded as changes, not overwrites, so a saved layout or a paper position on a renamed symbol still resolves.
- **FR-SY-5 · Continuous futures.** `MCX:GOLD1!` and `NSE:NIFTY1!` resolve to the front-month contract and roll on a stated rule. A roll is visible on the chart; history is spliced without adjustment unless the user picks back-adjusted.
- **FR-SY-6 · Search.**
  - **Matching:** fuzzy search over ticker, description, ISIN and aliases. Aliases include `NIFTY 50` → `NSE:NIFTY` and `gold` → `MCX:GOLD1!` / `OANDA:XAUUSD`.
  - **Filters:** by exchange and type.
  - **Ranking:** active, liquid instruments first.
  - **Speed:** results in under 100 ms from an in-memory index.
- **FR-SY-7 · Validation.** A canonical ID is validated once, at the API edge, by looking it up in the master. There is no character-class regex. An unknown ID returns `404 SYMBOL_NOT_FOUND`, with "did you mean" suggestions.
- **FR-SY-8 · Corporate actions.** Splits and bonuses adjust stored daily history (adjusted and raw are both kept). Intraday history is shown raw, and the chart marks the action.
- **FR-SY-9 · Migration.** Saved data from `ai-trader` (watchlists, layouts, paper positions), if migrated (Q5), is mapped to canonical IDs. Anything that can't be mapped is reported, not dropped.

## 6. UI requirements

- **FR-UI-1 · Layout like a professional terminal:**
  - left: watchlist;
  - centre: chart, with toolbars above and to the left;
  - right: a tabbed panel (agent chat, positions, orders, news, alerts);
  - bottom: an optional panel (paper orders and trades, backtest results).

  Panels can be resized and collapsed, and the layout is saved per user.
- **FR-UI-2 · Pages:** Home (brief, alerts, headlines with impact), Terminal, Portfolio (paper), Strategies and backtests, Alerts, Settings (profile, Telegram link, theme), Admin.
- **FR-UI-3 · Market-neutral.** No India-first defaults. Numbers use the viewer's locale. The currency is the instrument's own, and ₹ appears only where the value really is in rupees.
- **FR-UI-4 · Dark and light themes,** following the system setting by default.
- **FR-UI-5 · Phone and desktop.** Below the tablet breakpoint the terminal becomes a single column with a bottom sheet for chat and orders.
- **FR-UI-6 · Loading states.**
  - **First load:** a skeleton, and never a blank panel.
  - **Revisits:** the cached content stays on screen while a refresh runs.
  - **Never** a spinner over content that is already showing.
- **FR-UI-7 · Every empty or error state says why** and what happens next:
  - market closed, with the next open in the user's time;
  - symbol not found;
  - data provider down, with a retry;
  - reconnecting, with a live indicator;
  - rate-limited, with a time until retry.
- **FR-UI-8 · A connection status indicator** that is always visible: live, delayed (with the delay), reconnecting, or offline.
- **FR-UI-9 · Keyboard:** symbol search on any key (as in TradingView), interval shortcuts, and `Esc` to close.
- **FR-UI-10 · Accessibility:** WCAG AA contrast, and every control reachable by keyboard.

## 7. Functional requirements

### 7.1 Charts and terminal
- **FR-CH-1 · Chart engine:** TradingView Lightweight Charts v5, with the current chart types (candles, Heikin Ashi, Renko, Kagi, Point & Figure, footprint and others) built from the same bars.
- **FR-CH-2 · Indicators** come from the indicator engine (§7.10).
- **FR-CH-3 · Multi-chart layouts:** 1, 2, 3, 4, 6 or 8 charts per layout. Symbol, interval, crosshair, time and drawings can each be synced across them or not.
- **FR-CH-4 · Drawings and chart layouts** are saved per user and per symbol (by canonical ID).
- **FR-CH-5 · Scrolling back** loads older history by cursor (`before=<ts>&limit=N`). Each step fetches only the older page.
- **FR-CH-6 · Intervals:** 1m, 3m, 5m, 15m, 30m, 1h, 4h, 1D, 1W, 1M, plus custom multiples. Aggregation happens on the server, from 1-minute bars, on the session grid.
- **FR-CH-7 · Bar replay.** Pick a start point; the chart replays bar by bar at a chosen speed, with indicators computed only from bars revealed so far (no lookahead). Paper orders can be placed against replayed prices in a separate replay account.
- **FR-CH-8 · Second-based intervals** (1s, 5s, 15s, 30s) for instruments with a live tick feed. Wave 2, because it needs tick storage (Q8).

### 7.2 Market data
- **FR-MD-1 · Providers:**
  - Kite Connect for NSE, BSE, MCX and NFO: instrument dump, history, quotes and the websocket;
  - Deriv for forex and metals;
  - Dukascopy for forex tick volume;
  - a US provider (delayed by default; see Q3).

  Every provider implements the same `MarketDataProvider` port and returns either data or a typed reason (`NO_DATA`, `MARKET_CLOSED`, `UNSUPPORTED`, `RATE_LIMITED`, `PROVIDER_DOWN`, `AUTH_EXPIRED`). A provider never returns `null` for "failed".
- **FR-MD-2 · Candle store.**
  - The server builds 1-minute bars from live ticks and saves them; it is the only source of truth for bars.
  - A nightly job backfills from history and reconciles: when the live-built and vendor-history bars disagree, the vendor wins and the repair is logged.
- **FR-MD-3 · The Kite session** is renewed by a scheduled login before the daily expiry, with a recovery path (§9, E3).
- **FR-MD-4 · Kite limits** (about 3 history requests per second; about 3,000 instruments per websocket connection, up to 3 connections):
  - one shared, process-wide rate limiter;
  - a subscription manager that keeps under the instrument caps;
  - scanners read the candle store, never Kite.
- **FR-MD-5 · Subscribe on demand.** The first viewer of an instrument starts its live feed; the last one to leave stops it after a 60-second grace period. Watchlist and universe instruments for scanners can be held subscribed all day.

### 7.3 Live streaming to the browser
- **FR-LS-1 · Socket.IO** (or a websocket with the same semantics) through the API. One connection per tab, authenticated with the same token as REST.
- **FR-LS-2 · Snapshot, then numbered updates.** Subscribing returns the current snapshot (last N bars plus the forming bar) and a sequence number per instrument. Every update after that carries `seq`.
- **FR-LS-3 · Gap detection.** A jump in `seq`, a reconnect, the tab becoming visible again, or the `online` event makes the client call `GET /bars?since=<lastBarTime>`. It merges the result by bar time, using the server's values.
- **FR-LS-4 · Idempotent merge.** Duplicate or out-of-order updates are safe: a bar keyed by `(instrument, interval, time)` is replaced, never appended twice.

### 7.4 Paper trading (owner decision D14)
- **FR-PT-1 · Accounts and orders.** Paper accounts per user, in the instrument's own currency. The first release covers INR for Indian instruments; USD accounts follow (Q4).
- **FR-PT-2 · Orders:** market, limit, stop and stop-limit, with an optional stop-loss and target. Fills come from live prices. A stop that the price gaps through fills at the next price, not at the stop price.
- **FR-PT-3 · Idempotent placement** through `clientOrderId` (unique index, and duplicates answered with the original order).
- **FR-PT-4 · Risk limits** are pure `(ok, reason)` checks that fail closed: max position size, max loss per day, max open positions, and allowed instruments.
- **FR-PT-5 · Intraday square-off** at a time set per exchange (15:20 IST for NSE/BSE). It is scheduled in Node and survives restarts: a missed run is caught up within its grace window.
- **FR-PT-6 · Realistic costs:** brokerage, STT, exchange fees, GST, stamp duty and slippage on every fill.
- **FR-PT-7 · The agent can read** the account, positions, orders and P&L. **It cannot place, change or cancel anything.**

### 7.5 AI agent
- **FR-AG-1 · Mastra** (`@mastra/core`, pinned to an exact version, Node ≥ 22.13) runs inside the Node backend as the `agent` module. Its tools are thin adapters that call the application services in the same process, not over HTTP.
- **FR-AG-2 · Models:** AWS Bedrock (as today), with a fallback model per task and keys minted from IAM roles.
- **FR-AG-3 · A budget for every turn:** rounds, wall clock and tokens, each with a ceiling, plus a per-user daily cap that the admin can change.
- **FR-AG-4 · No orders, no broker access** (owner decision D13):
  - the agent has no tool that writes to a broker or a paper account;
  - Zerodha credentials are never in the agent's context, its tools, its sandbox or its prompts.
- **FR-AG-5 · Guarded data functions** are the only way the agent reads data, for example `getBars`, `getQuote`, `searchInstruments`, `scanUniverse`, `getNews`, `getCalendar`, `getPortfolio` (read-only), `getIndicators` and `runBacktest`. Each one:
  - validates its inputs with a schema, using canonical IDs only;
  - checks that the requesting user may see the data;
  - is rate-limited per user and per conversation;
  - reads the candle store or a cache, never a vendor directly;
  - returns data or a typed reason (FR-MD-1);
  - is logged with user, turn and arguments.
- **FR-AG-6 · Numbers come from tools.** Prices, levels, sizes and odds come from tools or skill scripts, never from the model's own arithmetic. Chart drawings are computed on the server from real data, with the agent supplying only the intent.
- **FR-AG-7 · No code the agent writes runs on the server.** Strategies, alerts and screeners are declarative specs, validated against a schema. Pine the agent writes runs only in the Pine worker sandbox (FR-CH-2), and is checked against sample bars before it is attached.
- **FR-AG-8 · Streaming chat** to the UI through Mastra's AI SDK route (`handleChatStream`), consumed with `useChat`. Tool calls render as cards (data used, skill run, chart drawn).
- **FR-AG-17 · Every write the agent proposes is an action card the user confirms.** This covers saving an indicator, adding it to the chart, changing indicator settings, creating an alert, saving a template or layout, and adding to the watchlist.
  - The agent proposes; a card in the chat shows exactly what will change; the user confirms, through a modal where there are fields to edit.
  - The write tool is a Mastra tool that requires approval, using suspend and resume. Its approval is tied to that one proposal and expires after 15 minutes.
  - Card states are visible: pending, applied, dismissed, expired, failed (with the reason).
  - A confirmed action is idempotent, so a double click or a retry applies it once.
  - Reading data never needs a card. Orders do not exist as an action at all (FR-AG-4).
- **FR-AG-9 · Memory:** threads are saved per user. Working memory holds the user's watchlist, risk settings and recent topics.

**Skills (owner decision D10)**
- **FR-AG-10 · Skill format.** Skills are loaded in the Agent Skills `SKILL.md` format through Mastra's `skills` (agent-level) or a `Workspace` skills source. Each skill sits in its own folder: `SKILL.md`, `references/`, `scripts/`.
- **FR-AG-11 · Sources, vendored at a pinned commit and reviewed before use:**
  - `ankurgoels/trader-skills-india` (NSE): scanner, news, entry, exit, time machine, risk, budget, alerts, analyst, insiders.
  - `Jakeschincariol/day-trader-skill` (US): the same set; usable for US instruments once a US data source exists (Q3).
  - `tradermonty/claude-trading-skills` (about 75 skills): a reviewed subset, prioritising those that need no paid key (regime, breadth, position sizing, pre-trade discipline, trade memory, backtest review). Skills that need FMP or FINVIZ Elite are enabled only if those keys are bought (Q6).
- **FR-AG-12 · Dropped skills:** `trader-broker`, `trader-in-broker`, and any skill that places, stages or templates orders for a live broker. Removed, not disabled.
- **FR-AG-13 · Skill data goes through the guarded functions.**
  - Each kept skill's `SKILL.md` is edited to say "use these data functions" instead of "fetch from Yahoo or NSE".
  - Each script is edited to read its data from an input file or argument, not from the network.
  - The changes are kept as a patch over the upstream copy, so upstream updates can be merged.
- **FR-AG-14 · Scripts run isolated.** Skill scripts run in an AWS-isolated sandbox: Amazon Bedrock AgentCore Code Interpreter through Mastra's AgentCore sandbox. If that can't meet the network rule below, the fallback is a locked-down Lambda or Fargate task.
  - **Network:** none outbound.
  - **Credentials:** none in the environment.
  - **Data:** the server stages only that run's data.
  - **Limits:** 60 s wall clock, capped memory.
  - **Output:** JSON validated against the skill's output schema before the agent sees it.
- **FR-AG-15 · Skill selection.** Only enabled skills are offered, found with `skill_search`. The admin can enable or disable each skill, and every run records its version (commit and patch).
- **FR-AG-16 · Honest output.** Odds, win rates and expectancy from any skill are shown with sample size, costs and drawdown (anti-goal 3). Skill disclaimers are kept.

### 7.6 Home, news and events
- **FR-HM-1 · Market overview,** twice on weekdays (before the Indian open, before the US open): global cues, an overall bias, and why.
- **FR-HM-2 · Headlines with impact.** News from the RSS sweep and APIs, deduplicated, clustered, and scored by the LLM for sentiment and for which instruments it moves (canonical IDs), in which direction and why. Filterable by exchange.
- **FR-HM-3 · Market alerts:** sharp moves in major markets, and Reddit and crowd sentiment, shown live in the app.
- **FR-EV-1 · Event agenda.** A daily agenda of scheduled releases (BLS, BEA, EIA, Fed, RBI, NSE/BSE results), each traced to a dated source.
- **FR-EV-2 · Event watcher.** Wakes before each release that matters, polls the source, compares the result against expectations or the previous figure, and alerts with the likely impact. This carries over the `newsd` event watcher, shocks and scorecard behaviour.
- **FR-EV-3 · Scorecard.** Every prediction (event impact, agent trade plan) is scored after the fact and stored.

### 7.7 Notifications
- **FR-NT-1 · In the app:** an alerts bell and a live feed.
- **FR-NT-2 · Telegram:** the user links their account by deep link. Their chat ID is stored per user in the database (not in Redis), and every alert type is opt-in.
- **FR-NT-3 · Ops alerts go to the developer by email only.** Telegram is never an ops channel.

### 7.8 Accounts and admin
- **FR-AC-1 · Sign-in** with email and password, and with Google. JWT access tokens plus rotating refresh tokens in httpOnly cookies, and roles (user, admin).
- **FR-AC-2 · Admin:** users, usage and caps (chat, skills), skill enable/disable, job health, provider health.

### 7.9 Backtesting
- **FR-BT-1 · Strategy specs.** Strategies are declarative specs (the condition DSL), backtested on the candle store.
- **FR-BT-2 · Pessimistic rules:**
  - a stop the bar opens through fills at the open;
  - full round-trip costs;
  - stop checked before target within a bar;
  - walk-forward or out-of-sample split shown;
  - number of variants tried shown.

### 7.10 Indicator engine (owner decision D17)

**Problems today, found in `ai-trader`:**
- **[Certain] Two engines.** The chart runs 49 Pine scripts through PineTS, while the agent, signals and backtests use 27 pandas-ta indicators in Python. The same RSI can come out different on the chart and in the agent's answer; this is how VWAP drifted before.
- **[Certain] Multi-timeframe and other-symbol data are silently wrong.** The sandbox's bars provider ignores the ticker and timeframe arguments and always returns the chart's own bars, so `request.security("NSE:NIFTY", "D", close)` gets the current chart's bars instead.
- **[Certain] The settings dialog is basic.** Colour, session, time, price, symbol, timeframe and text-area inputs fall back to a plain text box.
- **[Certain] Missing features:** indicator-on-indicator, indicator alerts, templates, and a data window.

**Engine**
- **FR-IN-1 · One engine.** Chart, agent, alerts, scanners, skills and backtests all get indicator values from one engine, so a value is the same everywhere.
- **FR-IN-2 · Two tiers, one set of numbers** (decided by the 2026-11-08 benchmark, `docs/benchmarks/2026-11-08-indicator-engine.md`).
  - **Built-ins:** native TypeScript (trading-signals 8.x, MIT), wrapped so that warm-up seeding and formulas match TradingView's. Used everywhere: chart, agent, scans, alerts, backtests. It is about 36 times faster than PineTS on a 2,000-symbol scan, and updating the forming bar costs about 1 µs.
  - **User, imported and agent-written Pine:** PineTS (pinned version) in a Node worker-thread pool. Each run is capped at 256 MB and 5 s, and a crashed worker is replaced.
  - **Parity tests:** every built-in has a parity test against PineTS's own `ta.*` result, which follows TradingView semantics, to 1e-9 after warm-up and with the warm-up bars matching too.
  - **TradingView reference fixtures:** a stored set of TradingView's own values (real NSE bars plus TradingView's built-in outputs, captured from the site) is checked in CI, to 1e-8. Measured 2026-11-08 on NSE:RELIANCE 1D: PineTS and trading-signals both within 1e-9 for RSI, ATR, MACD, Bollinger and EMA; pandas-ta's Bollinger off by up to ₹4.5.
  - **No third engine.** pandas-ta is not an engine; the benchmark showed its Bollinger and Supertrend values differ from TradingView's on every bar.
- **FR-IN-3 · Real data for `request.security` and `timeframe` inputs.** They read the candle store through a data provider that honours symbol, timeframe and range. PineTS 0.13.1 strips the exchange prefix before calling the provider (`NSE:NIFTY` arrives as `NIFTY`), so the engine must keep the full canonical ID, through an upstream fix or a wrapper. A test must prove `NSE:X` and `BSE:X` resolve to different data. Default is no lookahead (`barmerge.lookahead_off`), and higher-timeframe values only change when that bar has closed, unless the script asks otherwise.
- **FR-IN-4 · Pine coverage.**
  - **Coverage report:** a published table of supported Pine features, generated from tests: versions, functions, `plot*`, `fill`, `hline`, `bgcolor`, `barcolor`, `label`, `line`, `box`, `table`, `polyline`, `alertcondition`, `alert`, `request.*`, `strategy.*`.
  - **Unsupported features fail loudly:** a script that uses one fails with the line number and the feature name. It never runs with a quiet fallback.
- **FR-IN-5 · Updates while the market moves.** The live bar recomputes on each tick (default) or only on bar close (a per-indicator setting). Closed-bar values are final, and the engine flags scripts that repaint.
- **FR-IN-6 · Incremental computing.** A new tick or bar recomputes from saved state, not over the whole history. Target: updating 10 indicators on the forming bar costs ≤ 5 ms.
  - **Built-ins** use the native `add` and `replace` calls.
  - **Pine scripts** must use PineTS's `stream()` (always with `pageSize`), never `run()` again. Measured: `stream()` costs 0.78 ms per new bar and `run()` costs 127 ms, for 6 indicators on 5,000 bars.
  - **Custom Pine indicators also update on every tick** (owner decision). Stock PineTS caps forming-bar updates at about 1 per second (hard-coded) and appends a duplicate point per tick, so the engine carries a maintained PineTS patch set (FR-IN-29). Measured with the patch: 2–3 ms p50, under 6.5 ms p95 per tick for 6 indicators on 5,000 bars, with values identical to a full re-run.
- **FR-IN-31 · One wrapper over both runtimes (owner decision).** Callers never know which engine computes an indicator.
  - **Single entry point:** `IndicatorService.compute(symbol, interval, range, ref | source, inputs) → IndicatorResult` and `IndicatorService.subscribe(...)`. The REST API, the socket gateway, agent tools, alerts, scans, skills and backtests all go through it.
  - **Runtimes:** an `IndicatorRuntime` port with two implementations, `NativeRuntime` (trading-signals wrappers) and `PineRuntime` (patched PineTS in the worker pool). A `RuntimeResolver` chooses: native when the referenced built-in has a native implementation and its inputs are supported, otherwise Pine.
  - **References:** `builtin:<name>@<version>`, `script:<id>@<version>`, or raw `source` (previews of pasted code only).
  - **Every built-in also exists as a Pine script.** Native is a fast path proven equal to it by parity tests. If the native path is missing or fails, the Pine version runs. Users can view any built-in's source and fork it into a custom script.
  - **One contract for both runtimes:**
    - the input schema (Pine's `input.*` types);
    - `IndicatorResult` = named plots with one value per bar time, plus styles, `status` and `reason`;
    - live updates as `{ instanceId, barTime, values, seq }`.

    Chaining (FR-IN-13) works across runtimes through this plot model.
  - **No runtime-specific API.** There are no runtime-specific endpoints, DTOs or socket events. Endpoints: `GET /api/v1/indicators`, `GET /api/v1/indicators/{ref}`, `POST /api/v1/indicators/compute`, socket `subscribeIndicators`. The runtime used is recorded only in logs and traces.
- **FR-IN-29 · Maintained PineTS patch set.** It is applied to the pinned version with `patch-package` on the TypeScript source, with each patch covered by a test, and offered upstream:
  1. remove the 1-second forming-bar throttle in `stream()`;
  2. a push-driven provider (it answers when a tick arrives, `interval: 0`), so a tick needs no polling;
  3. one point per bar time in plot output: replace the last point rather than appending (until then, trim in the `data` handler, measured safe);
  4. keep the exchange prefix in `request.security` and `syminfo.tickerid` (FR-IN-3).
- **FR-IN-30 · Sharing and backpressure for live Pine.**
  - **Shared runs:** one live instance per `(canonical ID, interval, script hash, inputs)`, shared by every viewer and alert that needs it, and run in the worker pool.
  - **Overload:** if ticks arrive faster than an instance can compute, the newest tick wins (coalescing), and the instance never queues stale ticks.
  - **Budget:** p95 tick-to-indicator-value ≤ 10 ms for a script of up to 6 indicators. The pool scales on CPU; the benchmark suggests about 400 script updates per second per core.

**Library**
- **FR-IN-7 · Built-in library, delivered in two waves.**
  - **Wave 1 (~60):** everything from today's 49 and 27, plus:
    - anchored VWAP, session VWAP with bands;
    - auto Fibonacci retracement and extension;
    - pivot points (standard, Fibonacci, Camarilla, Woodie, DM);
    - ZigZag, Supertrend, Ichimoku;
    - volume profile (fixed range, session, visible range);
    - relative volume at time, correlation coefficient, relative strength vs. a benchmark symbol;
    - the 12 candlestick patterns.
  - **Wave 2 (to ~100):** TradingView's remaining common built-ins, chosen by usage.
- **FR-IN-8 · Formula and compare series.**
  - **Compare:** overlay another symbol as a line or percent.
  - **Formula:** a synthetic symbol such as `NSE:RELIANCE/NSE:NIFTY` or `OANDA:XAUUSD*FX_IDC:USDINR`, built on the server from candle-store bars and usable anywhere a symbol is.

**Settings dialog (like TradingView's)**
- **FR-IN-9 · Inputs tab.** Every Pine input type gets its own widget:
  - **numbers:** `int` and `float` with min, max and step;
  - **choices:** `bool`, `string` with an options dropdown;
  - **pickers:** `color` with opacity, `source` (OHLC, hl2, hlc3, ohlc4, hlcc4, or **another indicator's plot**), `timeframe` (including "chart"), `session`, `symbol` (opens symbol search);
  - **picked on the chart:** `price` and `time`, by clicking;
  - **text:** `text_area`;
  - **layout:** `group`, `inline` rows, tooltips.
- **FR-IN-10 · Style tab, for each plot:**
  - visible on or off;
  - colour with opacity;
  - width;
  - line style: solid, dashed or dotted;
  - plot type: line, step line, histogram, area, columns, circles, cross, or line with breaks;
  - price line and price label, on or off;
  - precision.

  It also covers `hline`, `fill`, `bgcolor` and labels, plus scale placement (left, right, none) and the pane (same, new, or move to another).
- **FR-IN-11 · Visibility tab.** Per-timeframe visibility (seconds, minutes, hours, days, weeks, months), each with its own from-to range.
- **FR-IN-12 · Defaults.** "Save as default", "Reset settings", and named presets per indicator.

**Working with indicators**
- **FR-IN-13 · Indicator on indicator.** Any input of type `source` can take any plot of any indicator on the same chart, and chains are allowed (A → B → C). Circular chains are rejected with a clear message.
- **FR-IN-14 · Templates.** Save the current set of indicators with all their settings as a named template; apply it to any chart; mark templates as favourites. Templates store canonical IDs and settings only.
- **FR-IN-15 · Legend and data window.**
  - **Legend:** each indicator's name, inputs and current values, with show/hide, settings, move-to-pane and remove buttons.
  - **Data window:** every value of every indicator at the crosshair.
- **FR-IN-16 · Panes:** add, remove, reorder, merge, maximise and collapse; heights are saved with the layout.
- **FR-IN-17 · No fixed limit on indicators per chart.** Instead there is a performance budget: 25 indicators on one chart with 5,000 bars must render within NFR-PF-1 and update the forming bar within 16 ms.
- **FR-IN-18 · Export:** CSV of the visible range with OHLCV and every indicator value.

**Pine editor**
- **FR-IN-19 · Editor:** syntax highlighting, autocomplete for the supported built-ins, errors shown inline with line numbers, run on the chart, save to "My scripts" with version history, and "paste from TradingView".
- **FR-IN-20 · Agent-written Pine** goes through the same compiler checks and coverage table, plus a test run on sample bars, before it can be attached.

**Alerts on indicators**
- **FR-IN-21 · Conditions:**
  - crossing, crossing up, crossing down;
  - greater than, less than;
  - entering or exiting a channel;
  - inside or outside a channel;
  - moving up or down by a percentage or value within N bars;
  - any `alertcondition()` or `alert()` in a script.

  Each condition is checked between a plot and a price, a value or another plot.
- **FR-IN-22 · Server-side evaluation.** Alerts are evaluated on the server against the candle store with the same engine, so they fire with the browser closed.
  - **Trigger:** once, once per bar, or once per bar close.
  - **Lifetime:** an expiry time.
  - **Delivery:** in the app and on Telegram (FR-NT-*).
  - **No duplicates:** delivery is idempotent per (alert, bar).
- **FR-IN-23 · Alert recovery.** Alerts whose bars were repaired after an outage (E1) are re-evaluated. An alert that would have fired during the outage fires once, marked "late", and states the original time.

**Importing an indicator through the agent**
- **FR-IN-25 · Paste code or share a link.** When the user pastes Pine source, or a link to one, into the chat, the agent recognises it and imports it.
  - **Links accepted:** a TradingView open-source script page, a GitHub file or gist, a raw text URL.
  - **Link fetching** goes through the guarded web fetch (NFR-SC-3), which returns text only; the fetched page is data, never instructions to the agent.
  - **Protected or invite-only TradingView scripts** publish no source. The agent says that plainly and offers to rebuild the idea from its description as a new script, clearly labelled as not the original.
- **FR-IN-26 · Checked before it is offered.** The imported source is compiled, checked against the coverage table (FR-IN-4) and test-run on the current chart's bars in the Pine sandbox. The result is one of:
  - ready;
  - ready with warnings (for example, repaints, or uses lookahead);
  - needs changes: the unsupported lines are listed. The agent may propose a converted version, which is shown as a diff against the original.
- **FR-IN-27 · Action card, then a modal. The agent never saves by itself.**
  - **The card:** the chat shows an action card with the result, a small chart preview, and the buttons *Save*, *Save & add to chart* and *Dismiss*.
  - **The modal:** *Save* opens a modal with:
    - name and description (editable);
    - the input defaults (editable, the same widgets as FR-IN-9);
    - the source, read-only with a diff if converted;
    - attribution: author, licence and source URL, kept automatically;
    - the target: "My scripts" or a template.
  - **Confirming saves it** as a new script version.
  - **Under the hood:** the save step is a Mastra tool that requires approval (it suspends until the user confirms). Nothing is written before the click.
- **FR-IN-28 · Duplicates and updates.** If a script with the same source hash already exists, the card says "already saved" and offers *Add to chart*. If the same name exists with a different source, the modal offers *Save as new version* or *Save as a copy*, never a silent overwrite.

**Agent and skills**
- **FR-IN-24 · Agent access.** The agent adds and removes indicators, changes their settings, and reads their values through guarded functions (`addIndicator`, `setIndicatorInputs`, `getIndicatorValues`). These use the same engine and the same settings schema as the UI. Skill scripts receive engine values as staged input; they do not compute their own versions of standard indicators.

## 8. Non-functional requirements

### 8.1 Robustness (owner decision D7)
- **NFR-RB-1 · Every external connection recovers by itself.** Kite and Deriv websockets, the browser socket, the database, Redis, Bedrock, the sandbox and news sources all reconnect with exponential backoff and jitter. Each failure mode is listed in §9 with its required behaviour.
- **NFR-RB-2 · Circuit breaker on every vendor:** after N consecutive failures the vendor is skipped for M minutes, with a half-open probe. A skipped vendor returns `PROVIDER_DOWN` at once; nothing waits on its timeout.
- **NFR-RB-3 · Timeouts and cancellation everywhere.** Every outbound call has a timeout, and every request handler honours cancellation, so an abandoned request stops its upstream work.
- **NFR-RB-4 · Idempotency:** paper orders, alert delivery, scheduled jobs and the inbound internal results from Python are all safe to run twice.
- **NFR-RB-5 · Durable jobs.** Scheduled jobs (square-off, Kite login, brief, news, agenda, watchdog, scorecard, nightly backfill) are durable: they survive restarts, catch up missed runs within a grace window, never run twice at once, and ping a heartbeat monitor.
- **NFR-RB-6 · Readiness is honest.** `/health` means the process is up. `/ready` means it can serve: the database and Redis are reachable, and the instrument master is loaded. A down vendor degrades its own feature, never the whole readiness check.
- **NFR-RB-7 · Graceful shutdown:** stop taking traffic, finish in-flight requests within 20 s, close sockets with a reconnect hint, and flush the forming bars.
- **NFR-RB-8 · Zero-downtime deploys** (rolling, or blue-green behind a load balancer). The browser reconnects and resyncs without a reload.

### 8.2 Performance (loading, D7)
- **NFR-PF-1 · Charts:**
  - first paint, warm cache: ≤ 1 s;
  - cold symbol: ≤ 2.5 s (p95);
  - from cache, switching back: ≤ 150 ms.
- **NFR-PF-2 · Older history:** each page ≤ 800 ms (p95).
- **NFR-PF-3 · Live tick, server receive to browser paint:** ≤ 300 ms (p95).
- **NFR-PF-4 · Browser cache:** TanStack Query with stale-while-revalidate; watchlist instruments are prefetched when idle.
- **NFR-PF-5 · Bundle:** the initial JS (gzipped) ≤ 250 KB for the shell. Charts, chat and admin are split into separate chunks that load on demand.
- **NFR-PF-6 · Agent:** the first token of a chat answer ≤ 2.5 s (p95).

### 8.3 Security
- **NFR-SC-1 · Secrets** live in AWS Secrets Manager. No secrets in the repo, the browser, the agent's context or the sandbox.
- **NFR-SC-2 · The sandbox** has no outbound network and no credentials (FR-AG-14).
- **NFR-SC-3 · The agent's web fetch** (if kept) has an SSRF guard: private and internal addresses are blocked, including after redirects.
- **NFR-SC-4 · The Python compute service** is private (inside the VPC only), authenticated by IAM or mTLS (not a shared header key), and cannot call the Node backend.
- **NFR-SC-5 · Rate limits** per user on every expensive endpoint (chat, skills, backtest, scan, Pine).

### 8.4 Observability
- **NFR-OB-1 · Structured JSON logs** with a request ID and user ID, carried across Node → Python → sandbox.
- **NFR-OB-2 · Traces and metrics:** OpenTelemetry, exported to CloudWatch or X-Ray. Agent and skill traces go through Mastra's observability.
- **NFR-OB-3 · Error tracking:** Sentry, for both frontend and backend.
- **NFR-OB-4 · Dashboards:** provider health, websocket reconnect count, candle repairs, job heartbeats, agent cost per day.

### 8.5 Quality
- **NFR-QL-1 · TypeScript `strict`**, with no `any` (lint error). Unknown external payloads are parsed with a schema at the edge.
- **NFR-QL-2 · Test coverage gates:** domain layer ≥ 90%, application layer ≥ 80%. Every failure-mode row in §9 has an automated test.
- **NFR-QL-3 · Carry over the existing Python tests** (about 279) for every piece of Python that carries over.

## 9. Failure modes and required behaviour

Every row is a requirement and needs a test that simulates it.

| # | What goes wrong | Required behaviour |
|---|---|---|
| E1 | Kite websocket drops | Reconnect with backoff and jitter, resubscribe every held token, backfill the missed minutes from Kite history, and mark the repaired bars. Clients receive the repaired bars as updates. |
| E2 | Kite websocket connected but silent during market hours (half-open) | A heartbeat watchdog: no ticks for 30 s while the market is open counts as dropped, then E1. |
| E3 | Kite token expired or login failed | Retry the scheduled login with backoff. If it still fails: Indian instruments show "delayed" or stale with a reason, the admin gets an email, and nothing is silently served from another source as if it were live. Recovers by itself once a login succeeds. |
| E4 | Kite rate limit (429) | A shared limiter queues the call; never retried in a tight loop. |
| E5 | Deriv websocket drops or goes silent | Same as E1/E2. |
| E6 | A vendor is down for minutes | Circuit breaker opens; cached bars are served with a `stale` flag and the UI shows it (FR-UI-7). |
| E7 | Browser socket drops (network change, laptop sleep) | Socket.IO reconnects, then resubscribes, then FR-LS-3 resync. The indicator shows reconnecting, then live. No reload. |
| E8 | Tab in the background for hours | On becoming visible: resync bars since the last one; refetch quotes and alerts. |
| E9 | Browser offline, then online | Queued UI actions (layout saves) retry with idempotency keys. Orders are never queued: they fail with a clear message. |
| E10 | A sequence gap in updates | FR-LS-3 resync for that instrument only. |
| E11 | Duplicate or out-of-order ticks | Bars stay correct (FR-LS-4); a tick older than the forming bar updates the right historical bar or is dropped after the bar closes. |
| E12 | Tick exactly on a bar boundary | It belongs to the new bar (start is inclusive, end exclusive); the rule is unit tested. |
| E13 | Pre-open (NSE 09:00–09:15), holidays, half days, Muhurat session, DST changes in the US and EU | Sessions come from the master's calendars. No candles are made outside sessions, and special sessions are honoured. |
| E14 | Client clock wrong | The server's time is used for the bar grid; the client works out its offset from the server. |
| E15 | User switches symbol while a request is in flight | The old request is cancelled (AbortController / query key); its late answer is never painted. |
| E16 | Server restarts mid-session | Forming bars are rebuilt from Redis and backfill; jobs catch up; clients reconnect and resync (E7). |
| E17 | Database down | `/ready` fails, so traffic drains to healthy instances. Reads served from cache are flagged; writes fail fast with a clear error. |
| E18 | Redis down | Live fan-out falls back to an in-process path on that instance; rate limits fall back to local; alert when Redis recovers. |
| E19 | Bedrock throttled or failing | Fallback model, then a clear error. Turn budgets still apply. |
| E20 | Skill sandbox times out or fails | The run fails with a reason, the agent says so, and a failure is never presented as a result. |
| E21 | Python compute service down | Its features (indicators that need it, backtests) report "unavailable"; charts and live data keep working. |
| E22 | Scheduled job missed or hung | Misfire catch-up within the grace window, a max-runtime kill, and a heartbeat miss email to the admin. |
| E23 | Instrument renamed, delisted, or contract expired | The change history in the master resolves old IDs; saved items show the change; continuous contracts roll. |
| E24 | Multiple tabs, same user | Each tab has its own socket; subscriptions are counted per tab; alerts are not duplicated in Telegram. |
| E25 | Deploy during market hours | Rolling deploy (NFR-RB-8); square-off and Kite login are never skipped because of a deploy. |
| E26 | A Pine script loops forever, runs out of memory, or crashes its worker | The worker is killed at its limit and replaced; that indicator shows the error; other indicators and the chart keep working. |
| E27 | An indicator asks `request.security` for a symbol or timeframe with no data yet | It returns `na` for those bars and the legend shows "loading" or the reason, never the chart's own bars. |
| E28 | An indicator-on-indicator chain has a failing or removed parent | The children show "source unavailable" and recover by themselves when the parent returns. |
| E29 | The server-side alert engine restarts or falls behind | It resumes from the last evaluated bar per alert; missed bars are evaluated in order; FR-IN-23 applies. |
| E30 | An indicator link can't be fetched (404, blocked, timeout, too large, not Pine) | The card says why and offers "paste the code instead". No partial import. |
| E31 | The user confirms an action card after the server restarted, or after the approval expired | The suspended run resumes from storage if it is still valid; otherwise the card shows "expired, ask again" and nothing is written. |
| E32 | Pasted text contains instructions aimed at the agent (prompt injection inside a script or page) | Treated as data: it is compiled and checked as Pine only; the agent's tools and permissions are unchanged by it. |

## 10. Architecture

### 10.1 Node backend: strict layered OOP (D2, D4)
- **Framework: NestJS** (builder's call, see §15 C1). It provides the Spring-style container: modules, constructor dependency injection, guards, interceptors, pipes and exception filters. The current Nest *code* is not carried over (D4); the framework is.
- **Structure, the same in every domain module:**

```
src/
  modules/<domain>/              instruments, market-data, live, charts, paper-trading,
                                 agent, skills, news, events, alerts, notifications,
                                 backtest, users, admin
    api/                         controllers, request/response DTOs, socket gateways — no logic
    application/                 use-case services, port interfaces (I…Repository, I…Provider)
    domain/                      entities, value objects, domain errors — no framework imports
    infrastructure/              repository implementations, ORM schemas, mappers,
                                 vendor adapters, Python compute client
  shared/
    config/                      typed config, validated at boot — the only reader of env
    errors/                      DomainError hierarchy, global exception filter, error codes
    events/                      in-process domain event bus
    resilience/                  retry, backoff, circuit breaker, rate limiter, timeouts
    observability/               logger, tracing, metrics
    auth/                        guards, current-user decorator, roles
```

- **Dependency rules** (R-1 to R-12 in `AGENTS.md`):
  - `api` → `application` → `domain`;
  - `infrastructure` implements `application` ports;
  - `domain` imports nothing outside itself;
  - a module calls another module only through the other module's exported application service, never through its repository or schema.

  `dependency-cruiser` enforces these in CI.

### 10.2 Python compute service (D3)
- **Stateless FastAPI service:** request in, result out. It stores nothing, schedules nothing, and never calls the Node backend.
- **What stays in Python** because it is already tested:
  - the condition DSL evaluator;
  - the backtest and signal evaluator (fills, costs, stop-before-target);
  - confluence.

  These take indicator series computed by the engine (§7.10) as input. They no longer compute indicators themselves.
- **pandas-ta is kept only as a test oracle,** in CI, to check that the engine's built-ins match it during porting. It is not on any runtime path.
- **What moves to Node:**
  - Kite (official `kiteconnect` JS client), Deriv, Dukascopy and US data;
  - the indicator engine and Pine (PineTS);
  - candlestick patterns;
  - every scheduler;
  - news, events, Telegram;
  - paper trading;
  - the agent.
- **Typed contract:** the TypeScript client is generated from the service's OpenAPI spec, and CI fails if they differ.

### 10.3 Frontend (D5, D6)
- **Stack:**
  - Vite + React + TypeScript, built as a static single-page app and served from S3 through CloudFront;
  - React Router for pages;
  - TanStack Query for server state, a small store (Zustand) for UI state;
  - Lightweight Charts for charts;
  - Tailwind plus a small component library for the UI;
  - AI SDK `useChat` for the agent.
- **Structure:** feature folders (`features/terminal`, `features/chat`, …). Components are presentational, logic lives in hooks, and no component exceeds 250 lines (lint rule).
- **No Node server for the frontend.** Auth redirects happen on the client, and protected data is protected by the API.

### 10.4 Data stores (builder's call, §15 C4)
- **PostgreSQL** (Amazon RDS) for users, the instrument master and mappings, paper trading, layouts, alerts, news results, the event agenda and scorecard, Mastra storage (threads, memory, workflow snapshots) and telemetry.
- **Bars:** 1-minute bars in a monthly-partitioned table; higher intervals as materialised roll-ups.
- **Redis** (Amazon ElastiCache) for hot caches, forming bars, pub/sub fan-out and rate-limit counters only. **Nothing in Redis is the only copy of user data.**

### 10.5 AWS deployment (D11, builder's call §15 C5)
- **Compute:** ECS Fargate services: `api` (Node: REST, sockets, agent) with 2 or more tasks behind an ALB; `market-data` (Node: vendor websockets, bar builder) as a single active task; `compute` (Python, private). Scheduled and background work runs in the Node services with a durable queue (BullMQ on Redis, or SQS plus EventBridge Scheduler).
- **Edge:** the frontend on S3 + CloudFront; a WAF in front of the ALB and CloudFront.
- **AI:** Bedrock for models; AgentCore Code Interpreter for skill scripts.
- **Secrets and alarms:** Secrets Manager; CloudWatch alarms for ops, by email.
- **Environments:** `staging` and `prod`. Deploys go through GitHub Actions with a manual promote to prod.
- **One market-data writer.** The market-data task is the only Kite websocket holder (Kite allows a limited number of connections). A leader lock in Redis or the database stops two tasks holding Kite at once during a deploy.

## 11. Interfaces (summary)

| Interface | Shape |
|---|---|
| REST | `/api/v1/...`, JSON. Errors as `{ code, message, details?, requestId }` with stable codes (`SYMBOL_NOT_FOUND`, `MARKET_CLOSED`, `PROVIDER_DOWN`, `RATE_LIMITED`, …). Cursor pagination. |
| Bars | `GET /api/v1/bars?symbol=NSE:RELIANCE&interval=5&before=<ts>&limit=500` and `…&since=<ts>`. The response carries the bars, a `status` and, if degraded, a `reason`. |
| Live | Socket: `subscribe { symbol, interval }` gets back `snapshot { bars, seq }`, then `bar { bar, seq }` updates; plus `status { state, reason }` and `alert`. |
| Agent | `POST /api/v1/agent/chat` (AI SDK UI message stream). |
| Compute | Internal `POST /compute/v1/{indicators,patterns,conditions,backtest,evaluate}`, generated client. |
| Telegram | `POST /api/v1/telegram/webhook` (verified by secret token). |

## 12. Data carried and dropped

**Carried over (rebuilt, not copied):**
- charts, chart types, indicators, Pine;
- drawings and layouts;
- watchlists;
- paper trading with risk limits, costs and square-off;
- the agent's capabilities (chart reading, data, portfolio read, web search, backtests, chart drawing, Pine writing);
- market overview;
- news with impact;
- drift and Reddit alerts;
- the event agenda, watcher, watchdog, shocks and scorecard;
- Telegram per-user alerts;
- admin and caps.

**Logic to port from `ai-trader` with its tests:**
- the backtest and evaluation rules;
- the risk gates;
- the cost model;
- the indicator allow-list (now: only built-ins and scripts that passed the engine's checks are callable);
- the session-anchored VWAP (as the engine's VWAP built-in);
- today's 49 Pine indicators and 27 pandas-ta indicators (merged into the one library);
- the Kite login timing (mint after the 06:00 IST expiry sweep);
- the market-data contract (statuses and reasons).

## 13. What is dropped (D1)

- The hand-built agent loop (`orchestrator`, `runner`, `turn`, `transcript`, `toolbox`), replaced by Mastra.
- The hidden Signals feature: the screener, the signal persistence and broadcast path, the Signals page and terminal signal fetches. *To confirm: Q1.*
- Trade-candidate generation inside the market overview (it always produced zero and the UI ignored it).
- Every service-to-service call from Python back into Node (`/api/internal/*`) and the shared `x-internal-key`.
- Redis used as a database (Telegram subscribers, watches, scorecards).
- The Next.js server and middleware.
- Running Node subprocesses from Python (Pine sandbox, Dukascopy bridge).
- yfinance in any path where a proper provider exists.
- Leftovers from earlier deployment targets (Lambda, Fargate task files, nginx, Serverless, the SQS poller flag) and unused dependencies listed in `ai-trader/docs/cleanup-audit.md`.
- Comments that narrate bug history. Comments state what and why, briefly.

## 14. How it gets built (D8)

- **Rules file:** `ai-trader-2/AGENTS.md` holds the rules Codex follows and Claude reviews against:
  - the layer rules R-1 to R-12;
  - the resilience rules (every §9 row);
  - the security rules;
  - naming, errors, tests;
  - the forbidden list (no `any`, no `process.env` outside config, no vendor symbol outside its adapter, no direct ORM in services, no network in skill scripts).
- **Loop per task:**
  1. Claude writes the task with the requirement IDs it covers.
  2. Codex implements it on a branch.
  3. CI runs lint, types, dependency rules, tests and contract checks.
  4. Claude reviews the diff against `AGENTS.md` and the cited requirements.
  5. The task is done only when every cited requirement has a passing test.
- **CI gates:**
  - `tsc --noEmit` strict;
  - ESLint with no warnings;
  - `dependency-cruiser`;
  - unit and integration tests, including the §9 failure simulations (fake websocket servers, toxiproxy-style network faults);
  - an OpenAPI contract diff;
  - indicator parity: every built-in matches its expected outputs, and pandas-ta where an equivalent exists;
  - the Pine coverage table regenerated with no unexplained changes;
  - a bundle size check (NFR-PF-5);
  - Python `ruff`, `mypy` and `pytest` for the compute service.

**Delivery order** (each step is shippable to staging):
1. Foundation: repo layout, `shared/*`, CI gates, `AGENTS.md`, AWS staging.
2. Instruments: the master, mappings, search, and canonical IDs end to end (§5).
3. Market data: provider ports, Kite and Deriv adapters, the candle store, backfill, and E1–E6, E13, E16.
4. Live streaming and charts: the snapshot/sequence protocol, cursor history, the new terminal UI, and E7–E12, E14, E15.
5. Indicator engine, wave 1: the engine, `request.security`, the settings dialog, indicator-on-indicator, templates, the legend and data window, the Pine editor, server-side indicator alerts, and E26–E29.
6. Paper trading.
7. Python compute service and backtests (consuming engine series).
8. Agent on Mastra: guarded functions, memory, chat UI.
9. Skills: vendored packs, patches, AgentCore sandbox.
10. News, events, alerts, Telegram, Home.
11. Admin, observability dashboards, prod cut-over.
12. Wave 2: the rest of the built-in library, bar replay, second-based intervals.

## 15. Builder's calls (the owner can overturn any of these)

| # | Call | Why |
|---|---|---|
| C1 | Keep **NestJS** as the framework and rewrite the code with strict layers. | It is the Spring-style dependency-injection container for Node. Hand-rolled DI on Express means rebuilding that layer and maintaining it alone. |
| C2 | Agent skills start with India (`trader-skills-india`) plus the no-paid-key tradermonty subset; US day-trader skills wait for a US data source. | Zerodha covers only Indian markets. |
| C3 | Python keeps only numeric compute; Kite, Pine and all scheduling move to Node. | One language owns every workflow; Python never calls back. |
| C4 | **PostgreSQL** in place of MongoDB, and Redis only as a cache. | Relational paper-trading data, time-partitioned bars, Mastra's recommended production store. Current data is about 2 MB, so moving costs little. |
| C5 | ECS Fargate + ALB + S3/CloudFront + RDS + ElastiCache, with staging and prod. | "Anything AWS" lifts the single 2 GB box limit; this gives rolling deploys and failure isolation. |
| C6 | Lightweight Charts, not the TradingView Charting Library. | The Charting Library needs a licence application; Lightweight Charts is open source and already proven here. |
| C7 | Skill scripts are patched to read staged data rather than rewritten as tools. | Keeps the upstream packs mergeable and isolated in the sandbox. |
| C8 | **One set of numbers from two tiers:** native TypeScript built-ins (trading-signals) for everything, and PineTS only for user, imported and agent-written Pine, with parity tests binding the two. The Python indicator maths is retired. | Benchmarked 2026-11-08: a 2,000-symbol scan takes 29 s on PineTS and 0.8 s native. PineTS's live `stream()` is incremental (0.8 ms per update). pandas-ta disagrees with TradingView on Bollinger and Supertrend. PineTS is the only mature runtime for pasted Pine. |

## 16. Open questions for the owner

| # | Question | Default if unanswered |
|---|---|---|
| Q1 | Drop the hidden Signals feature entirely, or keep it for later? | Dropped. |
| Q2 | Migrate existing users and their data from `ai-trader`, or start fresh? | Start fresh, with a one-off migration script for users and watchlists only. |
| Q3 | Buy a live US data source (Alpaca free with a paper account, or Polygon), or keep US delayed? | Delayed US through the existing free source; US skills off. |
| Q4 | USD paper accounts for US and forex in the first release? | INR only at first. |
| Q5 | How much history should the candle store keep? | Daily bars as far back as Kite allows; 1-minute bars for 2 years. |
| Q6 | Buy FMP or FINVIZ Elite keys for the tradermonty skills that need them? | Not bought; those skills off. |
| Q7 | Monthly AWS budget ceiling? | Not set. Builder estimates before step 1 of delivery. |
| Q8 | Store raw ticks (needed for second-based intervals, footprint on Indian instruments, and exact replay)? It costs storage. | No: 1-minute bars only in the first release; ticks for watchlist instruments in wave 2. |

## 17. Acceptance

The release is accepted when:
- every `FR`/`NFR` has a passing test or a recorded measurement;
- every §9 row has a passing failure-simulation test;
- a full Indian trading day runs on staging with a forced Kite websocket drop, a forced browser disconnect and a forced deploy, and charts show zero missing or wrong 1-minute bars against Kite's own history for the day;
- a security review confirms the sandbox has no network and no credentials, and that the agent has no order path;
- for the same instrument and bar, the chart, the agent, an alert and a backtest report the same value for every built-in indicator.
