# Phase 1 — Instruments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution model:** manager (Claude) → employee (Codex) per `docs/process/WORKFLOW.md`. One branch per task; the manager reviews, reruns `pnpm check` and merges with `--no-ff`. **[manager]** tasks are Claude's.

**Goal:** Every instrument has one TradingView-style canonical ID (`EXCHANGE:TICKER`), backed by a daily-refreshed instrument master with provider mappings stored as data. Search answers in under 100 ms, and the terminal can find and open any instrument.

**Architecture:**
- **New API module `instruments`** (api / application / domain / infrastructure), plus a shared, durable job scheduler (BullMQ).
- **Kite session in `shared/vendors/kite`:** session minting and storage, used by every Kite adapter, here and in Phase 2.
- **Sources behind one port:** Kite (NSE, BSE, MCX, NFO, indices), Deriv (forex and metals, a fixed table) and Nasdaq Trader (US listings), all feeding one `InstrumentSource` port.
- **Search:** an in-memory MiniSearch index, rebuilt after each refresh.
- **Web:** a TradingView-style symbol search dialog.

**Tech Stack:** NestJS 12.4, Drizzle 0.45 + Postgres 18, BullMQ 6.7, `kiteconnect` 5.3.0, `otplib` 13.6, MiniSearch 7.2, MSW 3.0 (HTTP fakes in tests), React 19.3 + TanStack Query, shadcn Command (cmdk).

**Spec:** `docs/SRD.md` §5 (FR-SY-1..9), FR-UI-9, NFR-RB-5, E3, E4, E22, E23. Roadmap: `docs/superpowers/plans/2026-11-08-roadmap.md`.

## Global Constraints

- Everything in `docs/superpowers/plans/2026-11-08-phase-0-foundation.md` § Global Constraints, plus `AGENTS.md`.
- **Canonical ID** = `EXCHANGE:TICKER`, uppercase exchange `[A-Z0-9_]+`, ticker as the exchange lists it. This is the only symbol format outside vendor adapters (R-11).
- **Vendor formats** (Kite tradingsymbols and tokens, Deriv `frx…`, Nasdaq file fields) appear only in `infrastructure/sources/<vendor>/` and in the `instrument_mappings` table.
- **No live vendor calls in tests.** Kite, Deriv and Nasdaq are faked with MSW or recorded fixtures. Real-credential checks are manager-run smoke scripts, never in CI.
- **Credentials:** `ZERODHA_API_KEY`, `ZERODHA_API_SECRET`, `ZERODHA_USER_ID`, `ZERODHA_PASSWORD` and `ZERODHA_TOTP_SECRET` come through `AppConfig` (optional in `test`, required in `production`). They are never logged and never returned by any endpoint.
- **Times:** IST for Indian schedules (`Asia/Kolkata`); every instant is stored as `timestamptz`.

## Review Focus

1. **A rename or delisting between refreshes.** A saved ID (`NSE:OLDNAME`) must still resolve, to its successor or a "delisted on <date>" status, never a silent 404. Test: P1-5 `resolves a renamed instrument through its change history`.
2. **Kite login failure at 06:20 IST** (wrong TOTP, 2FA page change, network). The refresh keeps yesterday's master, marks the source `stale` with a reason, emails ops (stubbed), retries with backoff, and never wipes instruments. Test: P1-5 `a failed source keeps the previous master and records stale`.
3. **Search inputs:** empty, one character, lowercase, spaces (`nifty 50`), `&` (`ARE&M`), an ISIN, a typo (`relianse`). Each returns ranked results or an empty list; none throws. Test: P1-6 `search handles awkward queries`.
4. **The process restarts during a refresh.** The refresh is idempotent: a partial run never leaves half-applied mappings (one transaction per source), and the job catches up after restart. Test: P1-5 `refresh is atomic per source and idempotent`.
5. **Two expiries rolling on the same day** for a continuous contract (`MCX:GOLD1!`). It resolves to the nearest unexpired contract, by IST date, at the session cutover. Test: P1-4 `continuous contract rolls to the next expiry after the last trading day`.

---

## File Structure (new in Phase 1)

```
apps/api/src/
  shared/jobs/                 job-scheduler.module.ts, job-scheduler.ts (BullMQ wrapper), index.ts
  shared/vendors/kite/         kite-login.ts, kite-session.service.ts, kite-session.repository.ts, kite.module.ts, index.ts
  shared/database/schema/      vendor-sessions.ts, instruments.ts (tables), index.ts (re-exports)
  modules/instruments/
    domain/                    instrument-id.ts, instrument.ts, instrument-change.ts, continuous.ts, errors.ts
    application/               ports/{instrument-repository.ts,instrument-source.ts,search-index.ts},
                               refresh-instruments.ts, resolve-instrument.ts, search-instruments.ts, index.ts
    infrastructure/            drizzle-instrument.repository.ts, minisearch-index.ts,
                               sources/kite/{kite.source.ts,kite-mapping.ts}, sources/deriv/deriv.source.ts,
                               sources/nasdaq/nasdaq.source.ts, refresh.job.ts
    api/                       instruments.controller.ts, dto.ts
    instruments.module.ts
packages/contracts/src/        instrument.ts (InstrumentSchema, InstrumentSearchResultSchema)
apps/web/src/features/symbol-search/   index.ts, symbol-search-dialog.tsx, use-symbol-search.ts, use-open-on-type.ts
scripts/smoke/kite-login.ts    manager-run, real credentials, never in CI
```

---

### P1-1 [Codex]: Instrument domain

**Files:** `modules/instruments/domain/{instrument-id.ts,instrument.ts,instrument-change.ts,continuous.ts,errors.ts}` plus specs.

**Produces:**
- **`InstrumentId`:**
  - `class InstrumentId { private constructor(readonly exchange: string, readonly ticker: string); static parse(raw: string): InstrumentId; static tryParse(raw: string): InstrumentId | null; toString(): string; equals(o): boolean }`;
  - `parse` trims surrounding whitespace, uppercases the exchange, keeps the ticker's case (it uppercases it only when the whole input was lowercase), and splits on the **first** `:`. That keeps `BSE:BSE SENSEX SIXTY 65:35` intact.
  - The exchange matches `^[A-Z0-9_]{1,20}$`. The ticker is 1–64 characters with no control characters.
  - Errors are `InvalidInstrumentIdError` (a domain error with code `VALIDATION_FAILED`).
- **`InstrumentType`:** `'stock' | 'index' | 'futures' | 'option' | 'forex' | 'metal' | 'commodity' | 'etf' | 'bond'`.
- **`InstrumentStatus`:** `'active' | 'suspended' | 'delisted' | 'expired'`.
- **`interface Instrument`:** `{ id: InstrumentId; exchange; ticker; description; type; currency; timezone; session: string; pricescale: number; minmov: number; lotSize: number; expiry?: string /*YYYY-MM-DD*/; strike?: number; optionType?: 'CE'|'PE'; underlying?: InstrumentId; isin?: string; sector?: string; hasIntraday: boolean; volumeType: 'real'|'tick'|'none'; status: InstrumentStatus; aliases: string[] }`. These are the SRD FR-SY-2 fields.
- **`type InstrumentChange`:** `{ kind: 'listed' | 'renamed' | 'delisted' | 'expired' | 'updated'; id: InstrumentId; successor?: InstrumentId; at: string }`.
- **`diffMasters(prev: Instrument[], next: Instrument[], at: string): InstrumentChange[]`:**
  - a rename is detected by the same ISIN, or the same vendor token passed in a mapping, under a new ticker;
  - IDs missing from `next` become `delisted` (or `expired` when past their expiry);
  - new IDs become `listed`;
  - a changed field set gives `updated`.
- **`resolveContinuous(root: string, rank: number, contracts: Instrument[], today: string): Instrument | null`:** for `GOLD1!`, the root is `GOLD` and the rank is 1. Contracts are futures with `expiry ≥ today`, sorted by expiry ascending; it returns the element at `rank - 1`.

**Tests first:**
- `parses and formats canonical ids`: `nse:reliance` → `NSE:RELIANCE`; `BSE:BSE SENSEX SIXTY 65:35` → ticker `BSE SENSEX SIXTY 65:35`; `NSE:ARE&M` keeps `&`.
- `rejects malformed ids`: `RELIANCE`, `:X`, `NSE:`, a 21-character exchange, and a control character each throw `InvalidInstrumentIdError`.
- `diff detects listed, delisted, expired, renamed by ISIN, updated`.
- `continuous contract rolls to the next expiry after the last trading day`: with expiries `2026-11-05` and `2026-12-05`, today `2026-11-05` gives Nov, and today `2026-11-06` gives Dec.
- `continuous returns null when no contract is unexpired`.

**Done:** coverage ≥ 90%; no imports outside `domain/` except `@aitrader/contracts`.

### P1-2 [Codex]: Durable job scheduler (shared)

**SRD:** NFR-RB-5, E22, E25.

**Files:** `shared/jobs/{job-scheduler.module.ts,job-scheduler.ts,index.ts}`; `test/jobs.int-spec.ts`.

**Produces:**
- `interface JobSpec<P> { name: string; cron: string; tz: string; maxRuntimeMs: number; graceMs: number; run(payload: P, signal: AbortSignal): Promise<void> }`.
- `class JobScheduler` with:
  - `register(spec)`: idempotent upsert of a BullMQ (6.7) job scheduler, using `upsertJobScheduler` with the `tz` pattern;
  - `runNow(name)`;
  - `onModuleDestroy` closing the workers gracefully;
  - one heartbeat per completed run, to a `HeartbeatSink` port with a no-op default.
- **Rules:**
  - concurrency 1 per job name;
  - a run beyond `maxRuntimeMs` is aborted through the signal and marked failed;
  - a run missed by downtime but still within `graceMs` runs once on start (catch-up); one outside the grace is skipped and logged.

**Tests first (Testcontainers Redis, fake clock where possible):**
- `runs a registered job on schedule`;
- `never runs two copies of one job`;
- `aborts a job at maxRuntimeMs`;
- `catches up a run missed within grace after restart`;
- `skips a run missed beyond grace and logs it`;
- `re-registering the same job does not duplicate it`.

### P1-3 [Codex]: Kite session

**SRD:** FR-MD-3, E3, NFR-SC-1.

**Files:**
- `shared/vendors/kite/{kite-login.ts,kite-session.service.ts,kite-session.repository.ts,kite.module.ts,index.ts}`;
- `shared/database/schema/vendor-sessions.ts` (table `vendor_sessions(vendor text pk, access_token text, minted_at timestamptz, expires_at timestamptz)`) plus a migration;
- `scripts/smoke/kite-login.ts`.

**Produces:**
- **`loginToKite(creds: KiteCredentials, http: KiteHttp, signal): Promise<{ requestToken: string }>`:**
  1. `POST https://kite.zerodha.com/api/login` with `user_id` and `password`, giving a `request_id`;
  2. `POST /api/twofa` with `user_id`, `request_id`, `twofa_value` (TOTP through `otplib`) and `twofa_type: 'totp'`;
  3. `GET https://kite.zerodha.com/connect/login?v=3&api_key=…`, following redirects manually until a `request_token=` appears in a `Location` header or the final URL.

  It uses `undici` (or fetch) with a cookie jar and a timeout of 15 s per call. Errors are typed `KiteLoginError` with a stage (`login | twofa | redirect | session`) and never include credentials.
- **`KiteSessionService`:**
  - `getAccessToken(): Promise<string>` returns the stored token if `expires_at` is in the future; otherwise it mints one through `kiteconnect` `generateSession(requestToken, apiSecret)` and stores it. It's single-flight: concurrent callers share one mint;
  - `expires_at` is the next 06:00 IST after `minted_at`;
  - the mint path sits behind a `CircuitBreaker` (`failureThreshold` 3, `openMs` 15 min);
  - a scheduled job `kite-session-refresh` runs daily at 06:20 IST (P1-2), with `graceMs` 6 h, so a box that was down at 06:20 still mints;
  - readiness `kite` = `up` when a valid token is stored, otherwise `down` with the reason.

**Tests first (MSW fakes the Kite endpoints):**
- `logs in through login, twofa and redirect`;
- `extracts request_token from Location or final URL`;
- `fails at the twofa stage with a typed error and no secrets in the message`;
- `reuses a stored unexpired token`;
- `mints once for concurrent callers`;
- `expiry is the next 06:00 IST`;
- `opens the breaker after 3 failed mints`.

**Manager step:** copy `ZERODHA_*` into `apps/api/.env` (git-ignored) from the old project, and run `scripts/smoke/kite-login.ts` once. It must print `token ok, expires <date>` and never the token itself.

### P1-4 [Codex]: Instrument sources

**SRD:** FR-SY-1..5, FR-MD-1, R-11.

**Files:** `modules/instruments/application/ports/instrument-source.ts`, `infrastructure/sources/{kite,deriv,nasdaq}/…`, fixtures under `infrastructure/sources/**/fixtures/` (small, real-shaped samples, ≤ 200 rows each).

**Produces:**
- **The port:** `interface InstrumentSource { readonly name: 'kite' | 'deriv' | 'nasdaq'; fetch(signal: AbortSignal): Promise<SourceSnapshot> }`, where `SourceSnapshot = { instruments: Instrument[]; mappings: ProviderMapping[] }` and `ProviderMapping = { id: string; provider: string; providerSymbol: string; providerToken?: string }`.
- **Kite mapping rules** (in `kite-mapping.ts`; each rule is a test):
  - NSE and BSE `EQ` rows → `NSE:<tradingsymbol>` (`stock`, INR, `Asia/Kolkata`; `pricescale` and `minmov` from `tick_size`; `lotSize` from `lot_size`). Series-suffixed `-BE`/`-SM` rows are kept as their own tickers.
  - Indices (`segment === 'INDICES'`) use TradingView names through an alias table:
    - `NIFTY 50` → `NSE:NIFTY`, `NIFTY BANK` → `NSE:BANKNIFTY`, `SENSEX` → `BSE:SENSEX`, `INDIA VIX` → `NSE:INDIAVIX`, `NIFTY FIN SERVICE` → `NSE:CNXFINANCE`;
    - other indices become `NSE:<name with spaces removed>`;
    - the original name is kept as an alias.
  - MCX futures → `MCX:<tradingsymbol>`, plus continuous IDs `MCX:<root>1!` and `MCX:<root>2!` resolved with `resolveContinuous`.
  - NFO futures and options → `NSE:<tradingsymbol>`, as TradingView lists them, with type `futures` or `option`, plus expiry, strike, `optionType` and underlying. Continuous `NSE:NIFTY1!`, `NSE:BANKNIFTY1!`, and others per underlying.
  - Every mapping: `{ provider: 'kite', providerSymbol: '<EXCH>:<tradingsymbol>', providerToken: instrument_token }`.
- **Deriv:** a fixed table of 29 instruments, carried over from the old project's `KNOWN_PAIRS`.
  - Forex → `FX:<PAIR>`; metals (`XAUUSD`, `XAGUSD`, `XPTUSD`, `XPDUSD`) → `OANDA:<PAIR>`.
  - `volumeType: 'tick'`; mappings `{ provider: 'deriv', providerSymbol: 'frx<PAIR>' }`.
- **Nasdaq Trader:** `https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt` and `otherlisted.txt`, pipe-delimited.
  - Rows map to `NASDAQ:<sym>`, `NYSE:<sym>` or `AMEX:<sym>` by the exchange code (`N` → NYSE, `A` → AMEX, `P` → NYSEARCA, `Z` → CBOE).
  - Test issues and the footer line are skipped. ETFs get type `etf`. USD, `America/New_York`.
  - Mappings: `{ provider: 'us-delayed', providerSymbol: <sym> }`.

**Tests first:**
- `maps NSE equity rows to NSE:<symbol>`;
- `maps indices to TradingView names with aliases`;
- `maps NFO options with strike, expiry, type and underlying`;
- `builds continuous futures ids for MCX and NFO`;
- `maps forex to FX and metals to OANDA`;
- `parses nasdaq files, skipping test issues and the footer`;
- `every source output passes InstrumentId.parse`.
- **Plus a conformance suite** that runs against all three sources: no duplicate IDs, every instrument has at least one mapping, no vendor symbol inside `id`.

### P1-5 [Codex]: Master persistence and daily refresh

**SRD:** FR-SY-2, FR-SY-3, FR-SY-4, E23, NFR-RB-4, NFR-RB-5.

**Files:**
- `shared/database/schema/instruments.ts`:
  - `instruments` (PK `id` text, the FR-SY-2 columns, `aliases text[]`, `source text`, `updated_at`);
  - `instrument_mappings` (PK `(id, provider)`, `provider_symbol`, `provider_token`, unique `(provider, provider_symbol)`);
  - `instrument_changes` (serial, kind, id, successor, at);
  - `instrument_source_status` (source PK, `status ok|stale`, reason, `last_success_at`).
- Plus a migration, `infrastructure/drizzle-instrument.repository.ts`, `application/{refresh-instruments.ts,resolve-instrument.ts}` and `infrastructure/refresh.job.ts`.

**Produces:**
- **`InstrumentRepository` port:** `replaceSource(source, snapshot, changes)` (one transaction per source), `findById(id)`, `findBySuccessor(id)`, `listActive()`, `getChanges(id)`, `setSourceStatus(...)`.
- **`RefreshInstruments.execute(signal)`:** for each source independently:
  1. fetch;
  2. diff against what's stored (`diffMasters`);
  3. `replaceSource` in one transaction;
  4. rebuild the search index.

  A failing source keeps its previous rows and records `stale` with the reason; the other sources still apply.
- **`ResolveInstrument.execute(raw)`:** `parse`, then `findById`. Otherwise it follows `renamed` changes to the successor; for delisted or expired IDs it returns the instrument with that status. An unknown ID throws `NotFoundError` with code `SYMBOL_NOT_FOUND` and `details.suggestions`, the top 5 matches from the search index.
- **Job `instruments-refresh`:** daily 07:00 IST (after the Kite session at 06:20), `graceMs` 6 h, `maxRuntimeMs` 10 min. It also runs once on boot when the master is empty.

**Tests first (integration, Postgres container, fake sources):**
- `refresh stores instruments and mappings`;
- `refresh is atomic per source and idempotent` (a source that throws mid-write leaves no partial rows; running twice gives the same rows and no duplicate changes);
- `a failed source keeps the previous master and records stale`;
- `resolves a renamed instrument through its change history`;
- `delisted ids resolve with status delisted`;
- `unknown ids raise SYMBOL_NOT_FOUND with suggestions`.

### P1-6 [Codex]: Search and REST API

**SRD:** FR-SY-6, FR-SY-7, §11.

**Files:** `infrastructure/minisearch-index.ts`, `application/search-instruments.ts`, `api/{instruments.controller.ts,dto.ts}`, `packages/contracts/src/instrument.ts`.

**Produces:**
- **`SearchIndex` port:** `rebuild(instruments)`, `search(q, { exchange?, type?, limit }) → InstrumentSummary[]`. MiniSearch 7.2:
  - fields: `ticker` (boost 4), `aliases` (boost 3), `description` (boost 1), `isin` (exact);
  - prefix and fuzzy (0.2);
  - ranking: active first; then stocks, indices and continuous futures ahead of individual options; then shorter tickers;
  - a rebuild swaps in atomically, so searches never see a half-built index.
- **Contracts:** `InstrumentSummarySchema` (`id`, `description`, `exchange`, `type`, `currency`, `status`) and `InstrumentSchema` (full).
- **Endpoints:**
  - `GET /api/v1/instruments/search?q=&exchange=&type=&limit=` (`limit` 1–50, default 20; `q` 0–64 characters; empty `q` returns popular defaults: NIFTY, BANKNIFTY, SENSEX, RELIANCE, XAUUSD, EURUSD, AAPL);
  - `GET /api/v1/instruments/:id` (URL-encoded canonical ID; 404 `SYMBOL_NOT_FOUND` with suggestions).

**Tests first:**
- `search handles awkward queries` (empty, `n`, `nifty 50`, `ARE&M`, `INE002A01018`, `relianse` → each returns an array without throwing; `relianse` includes `NSE:RELIANCE` in the top 3);
- `filters by exchange and type`;
- `ranks NSE:RELIANCE above its options for "reliance"`;
- `answers within 100 ms over 100k instruments` (a synthetic 100k set, p95 over 200 queries);
- `rebuild is atomic`;
- `GET by id returns 404 SYMBOL_NOT_FOUND with suggestions`;
- `responses satisfy the contract schemas`.

### P1-7 [Codex]: Symbol search in the terminal

**SRD:** FR-SY-6, FR-UI-9, FR-UI-6, FR-UI-7.

**Files:** `apps/web/src/features/symbol-search/{index.ts,symbol-search-dialog.tsx,use-symbol-search.ts,use-open-on-type.ts,recent-symbols.ts}`, shadcn `command` and `dialog`, and wiring in `terminal-route.tsx`.

**Produces:**
- **The dialog:** a shadcn Command (cmdk) dialog with:
  - an exchange filter (All, NSE, BSE, MCX, FX, OANDA, NASDAQ, NYSE) and a type filter;
  - results showing the ID, description, exchange badge and type;
  - keyboard navigation;
  - `Enter` navigates to `/terminal?symbol=<id>`, keeping `interval`.
- **`useOpenOnType()`:** typing any letter or digit while focus isn't in an input opens the dialog pre-filled with that character (as in TradingView). `Esc` closes it.
- **`useSymbolSearch(q, filters)`:** TanStack Query, 150 ms debounce, `keepPreviousData`, cancels on change.
- **Recent symbols:** the last 10, via `safeStorage`.
- **States:** a skeleton while first loading, "No matches for …" when empty, and an error with a retry.
- **Plain URL search params** (found at the Phase 0 close): TanStack Router JSON-encodes search values by default, so the URL reads `interval=%2215%22`. Set the router's `parseSearch` and `stringifySearch` so URLs read `?symbol=NSE:RELIANCE&interval=15`. Test: `terminal URLs use plain search params` (navigating gives `location.search === '?symbol=NSE%3ARELIANCE&interval=15'` or the unescaped colon form, with no quotes).

**Tests first (MSW for the API):**
- `typing a letter opens the dialog with that letter`;
- `does not open while typing in an input`;
- `debounces and shows results`;
- `Enter navigates to the selected symbol keeping interval`;
- `shows empty and error states`;
- `remembers recent symbols even when storage throws` (it no-ops).

### P1-8 [manager]: Phase close

- [ ] **Model and docs:**
  - **LikeC4:** add the `instruments` module components, `shared/jobs`, `shared/vendors/kite`, the externals `nasdaqtrader` and `kite` (login), and the relationships `api.instruments → postgres (writes)` and `jobs → redis`;
  - **`architecture/features/instruments/README.md`:** the refresh sequence, the resolve flow (rename, delisted, suggestions), the search ranking, and the `instrument_changes` state diagram.
- [ ] **Verification:**
  - `pnpm check` × 3 green in a row;
  - the Kite smoke login (manager);
  - one real refresh against Kite, Deriv and Nasdaq, with row counts per source recorded in `docs/tasks/phase-1-close.md`;
  - search latency measured on the real master.
- [ ] **Release:** tag `phase-1`, then write the Phase 2 (market data and candle store) plan.
