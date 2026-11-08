# Phase 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution model for this project:** Claude (manager) runs each Codex task through `docs/process/WORKFLOW.md`: brief, Codex implements on `task/<id>`, manager review, commit, `--no-ff` merge. Tasks marked **[manager]** are done by Claude directly.

**Goal:** A monorepo where every architectural rule, quality gate and diagram is enforced by one command (`pnpm check`). It contains an API shell (config, errors, logging, health, Postgres, Redis), a web shell (routing, server-state, UI-state, live-value primitive, theme, layout), and a shared resilience package.

**Architecture:**
- **Workspace:** pnpm workspace with `apps/api` (NestJS 12, strict layers per module), `apps/web` (Vite + React 19 SPA) and `packages/{contracts,resilience}`.
- **Enforcement:** layer rules in dependency-cruiser; dead code by knip; duplication by jscpd; types by `tsc` strict.
- **Diagrams:** LikeC4 for the architecture model; Mermaid generated from code by ts-morph.

**Tech Stack:** Node ≥22.13, TypeScript ~6.0, pnpm, NestJS 12.4, Zod 4.6, Drizzle 0.45 + PostgreSQL 18, ioredis 6 + Redis 8, pino 10, Vite 8, React 19.3 + React Compiler 1.0, TanStack Router 1.170 + Query 5.107, Zustand 5.1, Tailwind 4.3 + shadcn 4, Vitest 5, Testcontainers 12, ESLint 10, dependency-cruiser 18.7, knip 6.44, jscpd 5.4, LikeC4 1.60, ts-morph 28.

**Spec:** `docs/SRD.md` (§10.1, §10.3, §14, NFR-QL-1..3, NFR-OB-1, NFR-RB-3, NFR-RB-6), plus `docs/superpowers/plans/2026-11-08-roadmap.md`.

## Global Constraints

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`; `any` is a lint error (NFR-QL-1).
- `process.env` is read only in `apps/api/src/main.ts`, which passes it to `loadConfig` (SRD §10.1 "the only reader of env").
- API layout per module: `api/ → application/ → domain/`; `infrastructure/` implements `application` ports; `domain/` imports no framework; cross-module imports only through `modules/<m>/application/index.ts` (SRD §10.1).
- Error body everywhere: `{ code, message, details?, requestId }` with stable codes (SRD §11).
- Web: no component file over 250 lines (SRD §10.3); no `fetch` outside `src/shared/api/`; live ticks never go through React state (roadmap, "Why this state setup").
- Comments: terse, what and why; no bug-history narrative; removed code is deleted, never commented out.
- Every task: `pnpm check` green, and the feature diagrams under `architecture/` updated in the same branch.
- Exact dependency versions (no `^`) in every `package.json`; Renovate or manual upgrades only.

## Review Focus

1. **Missing or invalid env vars at boot.** Startup must fail once, listing *every* bad key, not just the first. Test: Task 5 `loadConfig reports all invalid keys at once`.
2. **A non-`Error` thrown** (a string, `undefined`, a plain object) inside a handler. Expect a 500 with `{ code: "INTERNAL", requestId }`, no stack in the body, and the process still alive. Test: Task 6 `filter maps thrown non-Error values to INTERNAL`.
3. **Postgres or Redis down at boot or mid-run.** The process stays up, `/health` returns 200, and `/ready` returns 503 naming the failing dependency; it recovers without a restart. Test: Task 9 `ready reports redis down and recovers`.
4. **Browser storage that throws** (private mode, blocked site data). The theme falls back to `system` with no crash. Test: Task 10 `theme store survives throwing localStorage`.
5. **Tick flood:** 1,000 `LiveStore.set` calls on one key within a frame. Expect exactly one notification per subscriber, carrying the last value, and safe unsubscribe during notification. Test: Task 11 `coalesces a flood into one notification with the latest value`.

---

## File Structure (end of Phase 0)

```
ai-trader-2/
  AGENTS.md                         rules Codex follows and the manager reviews against
  docs/process/WORKFLOW.md          manager → employee loop, review checklist, merge gate
  docs/process/task-template.md     task brief template
  docs/tasks/                       one brief + result per task (history of what Codex was asked)
  scripts/task/{start,codex,finish}.sh
  scripts/diagrams/gen-class-diagrams.ts
  architecture/model/*.c4           LikeC4 model
  architecture/features/<f>/        README.md (hand-written Mermaid), classes.mmd (generated)
  architecture/generated/           deps.html, deps.mmd, knip.md, jscpd.md (generated)
  package.json  pnpm-workspace.yaml  tsconfig.base.json  eslint.config.js  .dependency-cruiser.cjs
  knip.json  .jscpd.json  .prettierrc  .editorconfig  .nvmrc  .gitignore  docker-compose.dev.yml
  packages/contracts/src/{error-body.ts,error-codes.ts,index.ts}
  packages/resilience/src/{backoff.ts,retry.ts,timeout.ts,circuit-breaker.ts,token-bucket.ts,errors.ts,index.ts}
  apps/api/src/main.ts  app.module.ts
  apps/api/src/shared/config/{app-config.ts,load-config.ts,config.module.ts}
  apps/api/src/shared/errors/{domain-error.ts,errors.ts,global-exception.filter.ts}
  apps/api/src/shared/observability/{logger.module.ts,request-id.ts}
  apps/api/src/shared/database/{database.module.ts,database.health.ts,schema/index.ts}
  apps/api/src/shared/redis/{redis.module.ts,redis.health.ts}
  apps/api/src/modules/health/api/health.controller.ts  modules/health/health.module.ts
  apps/api/test/support/containers.ts
  apps/web/src/main.tsx  src/app/{router.tsx,providers.tsx,theme.css,routes/*}
  apps/web/src/shared/api/{http.ts,api-error.ts}
  apps/web/src/shared/state/theme-store.ts
  apps/web/src/shared/live/{live-store.ts,use-live-value.ts,frame-scheduler.ts}
  apps/web/src/shared/ui/*          shadcn components
  apps/web/src/app/layout/{app-shell.tsx,terminal-layout.tsx}
```

---

### Task 0 [manager]: Bootstrap repository

**Files:**
- Create: `.gitignore`, `.editorconfig`, `.nvmrc` (`22`), `README.md` (one paragraph plus links to the SRD, roadmap and workflow)
- Existing (commit as-is): `docs/SRD.md`, `docs/benchmarks/`, `docs/superpowers/plans/`, `spikes/indicator-bench/`

- [ ] **Step 1:** `git init -b main` in `D:\adizx\ai-trader-2`. Set `.gitignore` to `node_modules/`, `dist/`, `coverage/`, `.env*` (keeping `!.env.example`), `spikes/**/node_modules/`, `spikes/**/tv-*.json`, `spikes/**/bars.csv`, `spikes/**/engine-values.json`, `.likec4/`, `playwright-report/`, `test-results/`.
- [ ] **Step 2:** Run `git status --short`. Expected: no `node_modules` and no `tv-*.json` listed.
- [ ] **Step 3:** Commit on `main`: `chore: bootstrap repository with SRD, benchmarks and plans`.

### Task 1 [manager]: Rules and workflow

**Files:**
- Create: `AGENTS.md`, `docs/process/WORKFLOW.md`, `docs/process/task-template.md`, `scripts/task/start.sh`, `scripts/task/codex.sh`, `scripts/task/finish.sh`

**Produces:**
- **`scripts/task/start.sh <id> <slug>`:** branches `task/<id>-<slug>` from `main` and copies the template to `docs/tasks/<id>.md`.
- **`scripts/task/codex.sh <id>`:** runs `codex exec -C <repo> -s workspace-write -c sandbox_workspace_write.network_access=true -o docs/tasks/<id>.result.md - < docs/tasks/<id>.md`, with stdin from the brief. A plain prompt argument hangs waiting on stdin (verified).
- **`scripts/task/finish.sh <id> "<commit message>"`:**
  1. runs `pnpm check`;
  2. stages the changes;
  3. commits with `--author "Codex <codex@users.noreply.local>"`;
  4. switches to `main` and runs `git merge --no-ff task/<id>-<slug>`;
  5. deletes the branch.

  It refuses if the current branch isn't `task/<id>-*` or if `pnpm check` fails.

- [ ] **Step 1:** Write `AGENTS.md` with:
  - **Layer rules R-1…R-12** (as in Global Constraints, plus):
    - **R-5:** cross-module imports only through `application/index.ts`;
    - **R-6:** `shared/` never imports `modules/`;
    - **R-7:** no cycles;
    - **R-8:** no orphans;
    - **R-12:** web `features/<f>` imports only `shared/` and other features' `index.ts`.
  - **Resilience rules:** every outbound call has a timeout and is cancellable; retries use `@aitrader/resilience` (never hand-rolled); vendor calls go behind a circuit breaker; all job and message handlers are idempotent.
  - **The forbidden list:** `any`, `process.env` outside `main.ts`, ORM or Redis clients in `application/` or `domain/`, `fetch` outside `shared/api`, React state for ticks, comments that narrate history, commented-out code, `^` versions.
  - **Testing rules:** TDD; tests named for behaviour; every SRD failure-mode row a task touches gets a test.
  - **Diagram duties:** update `architecture/features/<f>/README.md` and run `pnpm diagrams`.
  - **Scope rule:** do only the brief; list anything else under "Follow-ups" in the result.
- [ ] **Step 2:** Write `WORKFLOW.md`:
  - the loop: brief, `start.sh`, `codex.sh`, manager review, at most 2 resumes (`codex exec resume --last`), then `finish.sh`;
  - the review checklist: SRD IDs covered by tests, rules R-1..12, no dead exports (knip), no new duplication (jscpd), diagrams updated, error codes from contracts, no secrets;
  - the merge gate;
  - what to do when Codex can't finish: the manager re-scopes into smaller tasks, never merges partial work.
- [ ] **Step 3:** Write `task-template.md`. Sections: Goal, SRD IDs, Files, Interfaces (consumes/produces), Tests to write first (names + assertions), Commands, Done when, Out of scope.
- [ ] **Step 4:** Smoke-test the loop on a throwaway task `T-000` ("add `docs/tasks/.keep`"): run `start.sh T-000 smoke`, then `codex.sh T-000`, then `finish.sh`. Expected: `git log --graph` shows a merge commit with a Codex-authored commit on the branch, and `codex.sh` didn't hang. If `network_access=true` is rejected by the CLI, remove the flag and document in WORKFLOW.md that the manager runs `pnpm install` before handing the task over.
- [ ] **Step 5:** Commit on `main`: `docs: agent rules, manager-employee workflow and task scripts`.

### Task 2 [Codex]: Workspace skeleton

**Files:**
- Create: `package.json` (root, `"packageManager": "pnpm@<latest 10.x or 12.x verified locally>"`, `engines.node: ">=22.13"`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `tsconfig.base.json`, `.prettierrc`, `packages/contracts/{package.json,tsconfig.json,src/index.ts}`, `packages/resilience/{package.json,tsconfig.json,src/index.ts}`, `apps/api/{package.json,tsconfig.json,tsconfig.build.json,nest-cli.json,vitest.config.ts,src/main.ts,src/app.module.ts}`, `apps/web/{package.json,tsconfig.json,vite.config.ts,index.html,src/main.tsx}`, `vitest.workspace.ts`
- Test: `apps/api/src/app.module.spec.ts`, `apps/web/src/main.spec.tsx`

**Produces:**
- **Package names:** `@aitrader/contracts`, `@aitrader/resilience`, `@aitrader/api`, `@aitrader/web`.
- **Root scripts:** `build`, `typecheck` (`pnpm -r exec tsc --noEmit`), `test` (`vitest run`), `lint`, `check` (filled in by Task 3).
- **API tests:** run on Vitest with `unplugin-swc`, so decorators and metadata work.

- [ ] **Step 1: Write failing tests:**
  - `app.module.spec.ts` → `it("boots the Nest application", ...)`: create a `TestingModule` from `AppModule` and expect `app.getHttpServer()` to be defined.
  - `main.spec.tsx` → `it("renders the root without crashing", ...)`: render `<App />` and expect `document.body` to contain `data-testid="app-root"`.
- [ ] **Step 2:** `pnpm test`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Scaffold with exact latest versions from the roadmap table: NestJS 12.4, TypeScript 6.0.x, Vite 8.3, React 19.3, `@vitejs/plugin-react` 6.2 with `babel-plugin-react-compiler` 1.0, Vitest 5.1. `tsconfig.base.json` sets the Global Constraints flags plus `experimentalDecorators` and `emitDecoratorMetadata`; they're used by the api project only.
- [ ] **Step 4:** Run `pnpm install && pnpm build && pnpm test`. Expected: both tests PASS and the build emits `apps/api/dist` and `apps/web/dist`.
- [ ] **Step 5:** Hand back to the manager with the result file listing the versions installed.

### Task 3 [Codex]: Quality gates

**Files:**
- Create: `eslint.config.js`, `.dependency-cruiser.cjs`, `knip.json`, `.jscpd.json`, `scripts/check.sh` (or a root `check` script)
- Test: `tools/gates/gates.spec.ts` with fixtures under `tools/gates/fixtures/{domain-imports-nest,application-imports-infra,cross-module-internal,shared-imports-module,cycle}/`

**Produces:**
- **`pnpm check`** = `lint && typecheck && test && depcruise && knip && jscpd && diagrams:check && build`. Until Task 4 lands, `diagrams:check` is a no-op that prints "pending Task 4".
- **Coverage gates (NFR-QL-2):** `test` runs Vitest with `@vitest/coverage-v8` thresholds: lines ≥ 90 for `apps/api/src/modules/*/domain/**` and `packages/**`, ≥ 80 for `apps/api/src/modules/*/application/**`. Paths with no files yet pass.

- [ ] **Step 1: Write failing tests** in `gates.spec.ts`. Each runs dependency-cruiser with the repo config against one fixture and asserts the exit code and rule name:
  - `rejects domain importing @nestjs/common` (rule `domain-no-framework`);
  - `rejects application importing infrastructure` (`application-no-infrastructure`);
  - `rejects importing another module's internals` (`module-public-api-only`);
  - `rejects shared importing modules` (`shared-no-modules`);
  - `rejects cycles` (`no-circular`);
  - `accepts a correct module` (exit code 0).
- [ ] **Step 2:** Run the tests. Expected: FAIL (no config).
- [ ] **Step 3:** Write the configs.
  - **ESLint:** `typescript-eslint` strict-type-checked; `@typescript-eslint/no-explicit-any: error`; `no-restricted-properties` on `process.env`, allowed only in `apps/api/src/main.ts`; `max-lines: 250` for `apps/web/src/**/*.tsx`; `eslint-plugin-react-hooks` 7.
  - **knip:** dead files, exports and dependencies for all workspaces.
  - **jscpd:** `threshold: 0`, `minTokens: 60`, ignoring tests and generated folders.
- [ ] **Step 4:** Run the tests, then `pnpm check`. Expected: all PASS and `pnpm check` exits 0 on the skeleton.

### Task 4 [Codex]: Diagrams toolchain

**Files:**
- Create: `architecture/model/{spec.c4,system.c4}`, `architecture/features/foundation/README.md`, `scripts/diagrams/gen-class-diagrams.ts`, `scripts/diagrams/gen-deps.sh`, `scripts/diagrams/gen-reports.sh`
- Test: `scripts/diagrams/gen-class-diagrams.spec.ts`

**Produces:**
- **`generateClassDiagram(projectDir: string, moduleDir: string): string`:** returns a Mermaid `classDiagram` covering every exported class and interface in `moduleDir`, with public members, `implements` and `extends` edges, and constructor-injected dependencies as `-->` edges.
- **Root scripts:**
  - `diagrams`: writes `architecture/features/<module>/classes.mmd` per API module and web feature, `architecture/generated/deps.html` and `deps.mmd` (dependency-cruiser), `knip.md` and `jscpd.md`.
  - `diagrams:check`: runs `diagrams`, then `git diff --exit-code architecture/`.
  - `diagrams:serve`: `likec4 serve architecture/model`.
  - `diagrams:build`: `likec4 build architecture/model -o architecture/site`. The site is git-ignored.

- [ ] **Step 1: Write failing tests** (fixture TS module with `interface Port`, `class Impl implements Port`, `class Service { constructor(private port: Port) {} }`):
  - `emits implements edges`: output contains `Port <|.. Impl`;
  - `emits injected dependencies`: output contains `Service --> Port`;
  - `is deterministic`: two runs give identical strings (sorted output).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with ts-morph 28. In the LikeC4 model:
  - `spec.c4`: element kinds `actor`, `system`, `container`, `component`, `store`, `external`;
  - `system.c4`: the trader and admin actors; containers `web`, `api`, `market-data`, `compute`; stores `postgres` and `redis`; externals `kite`, `deriv`, `bedrock`, `agentcore`, `telegram`. Each container carries its SRD section in its description.
- [ ] **Step 4:** Run `pnpm diagrams && pnpm diagrams:check`, then `npx likec4 validate architecture/model`. Expected: exit 0 and generated files present.

### Task 5 [Codex]: API config

**Files:**
- Create: `apps/api/src/shared/config/{app-config.ts,load-config.ts,config.module.ts}`, `apps/api/.env.example`
- Test: `apps/api/src/shared/config/load-config.spec.ts`

**Produces:**
- **`AppConfigSchema`** (Zod), with its type `AppConfig`:
  - `NODE_ENV`: `development | test | production`;
  - `PORT`: integer 1–65535, default 8000;
  - `DATABASE_URL`: URL;
  - `REDIS_URL`: URL;
  - `LOG_LEVEL`: pino levels, default `info`;
  - `CORS_ORIGINS`: comma list of URLs, parsed to `string[]`.
- **`loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig`:** throws `ConfigError` with `.issues: { key: string; problem: string }[]`.
- **`ConfigModule.forRoot(config: AppConfig)`:** global; provides the token `APP_CONFIG`.
- **`main.ts`:** calls `loadConfig(process.env)`.

- [ ] **Step 1: Write failing tests:**
  - `parses a valid environment`: typed values, `PORT` a number, `CORS_ORIGINS` an array;
  - `applies defaults`: `PORT=8000`, `LOG_LEVEL=info`;
  - `loadConfig reports all invalid keys at once`: missing `DATABASE_URL` plus `PORT=abc` gives `issues.length === 2` and both keys present;
  - `never echoes secret values in errors`: an invalid `DATABASE_URL=postgres://u:secret@x` gives a message without `secret`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests and `pnpm check`. Expected: PASS.

### Task 6 [Codex]: Error model

**Files:**
- Create: `packages/contracts/src/{error-codes.ts,error-body.ts}`, `apps/api/src/shared/errors/{domain-error.ts,errors.ts,global-exception.filter.ts}`
- Test: `packages/contracts/src/error-body.spec.ts`, `apps/api/src/shared/errors/global-exception.filter.spec.ts`

**Produces:**
- **`ERROR_CODES`** (const tuple): `VALIDATION_FAILED`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`, `SYMBOL_NOT_FOUND`, `MARKET_CLOSED`, `PROVIDER_DOWN`, `UNAVAILABLE`, `INTERNAL`. Plus the type `ErrorCode`.
- **`ErrorBodySchema`** (Zod) and `ErrorBody = { code: ErrorCode; message: string; details?: Record<string, unknown>; requestId: string }`.
- **`abstract class DomainError extends Error`:** `readonly code: ErrorCode`, `readonly httpStatus: number`, `readonly details?: Record<string, unknown>`.
- **Subclasses** in `errors.ts`:
  - `NotFoundError` (404 `NOT_FOUND`);
  - `ValidationError` (422 `VALIDATION_FAILED`);
  - `ConflictError` (409);
  - `RateLimitedError(retryAfterMs)` (429, with a `Retry-After` header in seconds);
  - `UnavailableError` (503 `UNAVAILABLE`).
- **`GlobalExceptionFilter`:** registered globally in `main.ts`.

- [ ] **Step 1: Write failing tests:**
  - `maps DomainError to its status and code`;
  - `maps Zod validation failures to 422 VALIDATION_FAILED with field details`;
  - `maps Nest HttpException 404 to NOT_FOUND`;
  - `maps unknown Error to 500 INTERNAL without stack or message leak` (body message `"Internal error"`);
  - `filter maps thrown non-Error values to INTERNAL` (throw `"boom"`, `undefined`, `{}`);
  - `always includes requestId` (taken from the request);
  - `sets Retry-After for RateLimitedError(1500)` → `"2"`;
  - `ErrorBodySchema rejects unknown codes`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. The filter logs unknown errors at `error` level with the stack, and domain errors at `warn`.
- [ ] **Step 4:** Run the tests and `pnpm check`. Expected: PASS.

### Task 7 [Codex]: Logging and health

**Files:**
- Create: `apps/api/src/shared/observability/{logger.module.ts,request-id.ts}`, `apps/api/src/modules/health/{health.module.ts,api/health.controller.ts}`
- Test: `apps/api/src/modules/health/api/health.controller.spec.ts`, `apps/api/src/shared/observability/request-id.spec.ts`

**Produces:**
- **`resolveRequestId(header: string | undefined): string`:** keeps a valid incoming `x-request-id` (≤ 64 chars, `[A-Za-z0-9-_]`), otherwise returns `crypto.randomUUID()`.
- **Logger:** nestjs-pino with `genReqId` via `resolveRequestId`, the response header `x-request-id`, and redaction of `req.headers.authorization` and `req.headers.cookie`.
- **`GET /health`** → `200 { status: "ok" }`.
- **`GET /ready`** → terminus checks registered by later tasks: `200 { status: "ok", checks }` or `503 { status: "error", checks }`.

- [ ] **Step 1: Write failing tests:**
  - `keeps a valid incoming request id`;
  - `replaces an invalid or oversized request id`;
  - `health returns ok without touching dependencies`;
  - `ready is ok with no registered checks`;
  - `response carries x-request-id` (supertest).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests and `pnpm check`. Expected: PASS.

### Task 8 [Codex]: Resilience package

**Files:**
- Create: `packages/resilience/src/{errors.ts,backoff.ts,retry.ts,timeout.ts,circuit-breaker.ts,token-bucket.ts,index.ts}`
- Test: one `*.spec.ts` per source file (fake timers)

**Produces:**
- **`backoffDelay(attempt: number, opts: { baseMs: number; maxMs: number; random?: () => number }): number`:** full jitter, `random() * min(maxMs, baseMs * 2 ** attempt)`.
- **`retry<T>(fn: (attempt: number, signal: AbortSignal) => Promise<T>, opts: { retries: number; baseMs: number; maxMs: number; retryOn?: (err: unknown) => boolean; signal?: AbortSignal; random?: () => number }): Promise<T>`.**
- **`withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number, parent?: AbortSignal): Promise<T>`:** rejects with `TimeoutError`, aborts the inner signal, and honours parent abort.
- **`class CircuitBreaker`:**
  - `constructor(opts: { failureThreshold: number; openMs: number; now?: () => number })`;
  - `exec<T>(fn: () => Promise<T>): Promise<T>`;
  - `get state(): "closed" | "open" | "half-open"`;
  - rejects with `CircuitOpenError` while open; one probe call is allowed when half-open.
- **`class TokenBucket`:** `constructor(opts: { capacity: number; refillPerSec: number; now?: () => number })`, `tryTake(n?: number): boolean`, `msUntil(n?: number): number`.
- **Error classes:** `TimeoutError`, `CircuitOpenError`, `AbortedError`.

- [ ] **Step 1: Write failing tests:**
  - `backoff never exceeds maxMs and is 0..cap`;
  - `retry stops after retries+1 attempts and rethrows the last error`;
  - `retry does not retry when retryOn returns false`;
  - `retry aborts promptly when signal aborts during backoff` (rejects `AbortedError`, no further attempt);
  - `withTimeout rejects TimeoutError and aborts the inner signal`;
  - `breaker opens after threshold, rejects fast, half-opens after openMs, closes on probe success, reopens on probe failure`;
  - `breaker allows exactly one concurrent probe in half-open`;
  - `bucket refills at rate and caps at capacity`;
  - `msUntil is 0 when tokens available`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with no dependencies; the package must run unchanged in Node and the browser.
- [ ] **Step 4:** Run the tests and `pnpm check`. Expected: PASS.

### Task 9 [Codex]: Postgres and Redis infrastructure

**Files:**
- Create: `docker-compose.dev.yml` (`postgres:18`, `redis:8`), `apps/api/src/shared/database/{database.module.ts,database.health.ts,schema/index.ts}`, `apps/api/drizzle.config.ts`, `apps/api/src/shared/redis/{redis.module.ts,redis.health.ts}`, `apps/api/test/support/containers.ts`
- Test: `apps/api/test/infra.int-spec.ts` (Testcontainers; run by `pnpm test:int`, included in `check`)

**Interfaces:**
- **Consumes:** `APP_CONFIG` (Task 5), `backoffDelay` (Task 8), the `/ready` registration (Task 7).
- **Produces:**
  - **`DB` token:** `NodePgDatabase<typeof schema>`, backed by a `pg.Pool`. Its size comes from config, the query timeout is 5 s, and it closes on shutdown.
  - **`REDIS` token:** an ioredis client with `lazyConnect`, `maxRetriesPerRequest: 1`, and `retryStrategy = attempt => backoffDelay(attempt, { baseMs: 200, maxMs: 10_000 })`.
  - **Health indicators** `database` and `redis`, registered on `/ready`.
  - **Test helpers:** `startPostgres(): Promise<{ url: string; stop(): Promise<void> }>` and `startRedis()`, with the same shape.
  - **Migrations:** `pnpm --filter @aitrader/api db:generate | db:migrate`.

- [ ] **Step 1: Write failing tests:**
  - `ready is ok when postgres and redis are up`;
  - `ready reports redis down and recovers`: stop the Redis container, expect `/ready` 503 with `checks.redis.status === "down"` and `/health` still 200; restart it, then poll until `/ready` is 200 within 15 s;
  - `ready reports postgres down` (same shape);
  - `app boots while redis is down` (`/health` 200).
- [ ] **Step 2:** Run `pnpm test:int`. Expected: FAIL.
- [ ] **Step 3:** Implement. The schema index is empty; features add tables later.
- [ ] **Step 4:** Run `pnpm test:int` and `pnpm check`. Expected: PASS.

### Task 10 [Codex]: Web shell

**Files:**
- Create: `apps/web/src/app/{providers.tsx,router.tsx,theme.css}`, `apps/web/src/app/routes/{__root.tsx,index.tsx,terminal.tsx}`, `apps/web/src/app/layout/{app-shell.tsx,terminal-layout.tsx}`, `apps/web/src/shared/api/{http.ts,api-error.ts}`, `apps/web/src/shared/state/theme-store.ts`, `apps/web/src/shared/ui/` (via the shadcn CLI: button, resizable, tabs, skeleton, tooltip), `apps/web/components.json`
- Test: `http.spec.ts`, `theme-store.spec.ts`, `terminal-layout.spec.tsx`

**Produces:**
- **`apiFetch<T>(path: string, opts: { schema: ZodType<T>; method?: string; body?: unknown; signal?: AbortSignal }): Promise<T>`:** parses success with `schema`; on failure parses `ErrorBodySchema` and throws `ApiError { code, status, requestId, details }`. A network failure throws `ApiError` with code `UNAVAILABLE`.
- **`useThemeStore`** (Zustand): `{ mode: "system" | "light" | "dark"; setMode(m) }`. Persisted through a storage wrapper that catches every throw. It applies `data-theme` on `<html>`.
- **Theme tokens:** CSS variables on `:root`, with a dark set under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`.
- **Routes:** `/` (Home placeholder) and `/terminal` (watchlist left, chart centre, right tabs: Chat, Positions, News, Alerts). Panels are resizable on `md` and above; a single column with tabs below `md`. Search params `symbol` and `interval` are typed via TanStack Router `validateSearch`, with the defaults `NSE:NIFTY` and `5`.
- **`QueryClient`** defaults: `staleTime: 30_000`, `retry: (n, err) => n < 2 && isRetryable(err)`, `refetchOnWindowFocus: true`.

- [ ] **Step 1: Write failing tests:**
  - `apiFetch parses success with schema`;
  - `apiFetch throws ApiError with server code and requestId`;
  - `apiFetch maps network failure to UNAVAILABLE`;
  - `apiFetch rejects a success body that fails the schema` (code `INTERNAL`);
  - `theme store survives throwing localStorage` (stub `getItem` and `setItem` to throw; `mode` stays `"system"`, no throw);
  - `terminal layout shows three regions on desktop and tabs on mobile` (`matchMedia` stub).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. No component file over 250 lines.
- [ ] **Step 4:** Run the tests and `pnpm check`. Then `pnpm --filter @aitrader/web build`; expected: the initial JS chunk is ≤ 250 KB gzipped (NFR-PF-5), reported in the result file.

### Task 11 [Codex]: Live-value primitive

**Files:**
- Create: `apps/web/src/shared/live/{frame-scheduler.ts,live-store.ts,use-live-value.ts,index.ts}`
- Test: `live-store.spec.ts`, `use-live-value.spec.tsx`

**Produces:**
- **`interface FrameScheduler { schedule(cb: () => void): void }`.** The browser version uses `requestAnimationFrame`; the test version flushes manually.
- **`class LiveStore<V>`:**
  - `constructor(scheduler: FrameScheduler)`;
  - `set(key: string, value: V): void`;
  - `get(key: string): V | undefined`;
  - `subscribe(key: string, listener: () => void): () => void`;
  - `subscribeAll(listener: (keys: ReadonlySet<string>) => void): () => void`, an imperative hook for chart adapters.
- **`useLiveValue<V>(store: LiveStore<V>, key: string): V | undefined`:** uses `useSyncExternalStore`.

- [ ] **Step 1: Write failing tests:**
  - `coalesces a flood into one notification with the latest value`: 1,000 `set` calls on one key, then one flush; the listener is called once and `get` returns the last value;
  - `notifies only subscribers of changed keys`;
  - `unsubscribe during notification is safe` (the listener unsubscribes itself and another; no throw, no call to the removed one);
  - `subscribeAll receives the set of changed keys once per frame`;
  - `useLiveValue re-renders once per frame, not per set` (render counter with a test scheduler: 100 sets plus one flush = 1 extra render).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests and `pnpm check`. Expected: PASS.

### Task 12 [manager]: Phase close

- [ ] **Step 1:** Update the model and docs:
  - **`architecture/model/system.c4`:** add the `api` components `config`, `errors`, `observability`, `database`, `redis`, `health`, and the web components `shell`, `api-client`, `live-store`, `theme`;
  - **`architecture/features/foundation/README.md`:** a request-lifecycle sequence (request id → handler → filter → log), and a `/ready` state diagram.
- [ ] **Step 2:** `pnpm diagrams && pnpm check`. Expected: exit 0, and the knip and jscpd reports empty.
- [ ] **Step 3:** Run `pnpm diagrams:serve`, open the viewer, and check the container view renders. Screenshot it into `docs/tasks/phase-0-close.md`.
- [ ] **Step 4:** Tag `phase-0` on `main`, and write the Phase 1 (Instruments) plan.
