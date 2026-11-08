# AGENTS.md — rules for every change in this repository

Codex (the implementer) follows these rules. Claude (the manager) reviews every branch against them before anything reaches `main`. The requirements live in `docs/SRD.md`; cite their IDs (`FR-…`, `NFR-…`, `E…`) in tests and task results.

## 0. Scope

- Do **only** what the task brief in `docs/tasks/<id>.md` asks. Anything else you notice goes under **Follow-ups** in `docs/tasks/<id>.result.md`. Don't do it.
- Never commit, merge, push, or edit `AGENTS.md`, `docs/process/**`, `docs/SRD.md` or `docs/superpowers/**`. The manager owns them.
- Write the result file before you finish, with these sections:
  - **What changed:** files and one line each.
  - **Tests:** names; the command; the final output tail.
  - **Versions installed.**
  - **Deviations from the brief, and why.**
  - **Follow-ups.**

## 1. Layers (API: `apps/api/src`)

Every domain module has this structure: `modules/<module>/{api,application,domain,infrastructure}`.

| Rule | Statement |
|---|---|
| R-1 | `domain/` imports only `domain/` of the same module and `@aitrader/contracts` types. No framework, ORM, Redis, HTTP or logger imports. |
| R-2 | `application/` imports its own `domain/` and its own ports (interfaces in `application/ports/`). Never `infrastructure/`, never `api/`. |
| R-3 | `api/` (controllers, DTOs, gateways) imports `application/` only. No logic beyond mapping DTO ⇄ application types. |
| R-4 | `infrastructure/` implements `application/` ports and may import `domain/`. Never `api/`. |
| R-5 | Across modules, import only `modules/<other>/application/index.ts`, never another module's internals. |
| R-6 | `shared/` never imports `modules/`. |
| R-7 | No circular dependencies anywhere. |
| R-8 | No orphan files, unused exports or unused dependencies (knip). |
| R-9 | `process.env` is read only in `apps/api/src/main.ts`, which passes it to `loadConfig`. Everything else injects `APP_CONFIG`. |
| R-10 | TypeScript strict; no `any`; no `as` casts to silence the compiler (parse unknown data with Zod at the edge instead). |
| R-11 | A vendor's symbol format, codes and payload shapes appear only inside that vendor's adapter in `infrastructure/`. Everything else uses canonical IDs (`EXCHANGE:TICKER`, SRD §5). |
| R-12 | Web (`apps/web/src`): `features/<f>` imports `shared/` and other features' `features/<g>/index.ts` only. `shared/` never imports `features/`. |

R-1 to R-8 and R-12 are enforced by `pnpm depcruise`, `pnpm knip` and ESLint. A rule that fails is a failed task: never weaken a rule's config to pass it.

## 2. Resilience (SRD §8.1, §9)

- **Timeouts:** every outbound call (HTTP, database, Redis, vendor socket, sandbox, LLM) has an explicit timeout and accepts an `AbortSignal`.
- **Retries** use `@aitrader/resilience` (`retry`, `backoffDelay` with full jitter). Never hand-roll a retry loop or a `setTimeout` backoff.
- **Circuit breakers:** every vendor gets one (`CircuitBreaker`). An open breaker returns a typed reason (`PROVIDER_DOWN`) at once.
- **Idempotency:** every job, message and webhook handler is safe to run twice; say how in the code (a key or a unique index).
- **Degrade one feature, not all.** A failing dependency degrades only its own feature; `/health` stays 200, and `/ready` names the failing dependency.
- **One test per failure mode.** For each failure-mode row (`E…`) a task touches, write a test that simulates it: fake clock, fake socket server, stopped container.

## 3. Errors

- Throw `DomainError` subclasses from `apps/api/src/shared/errors`. Codes come only from `ERROR_CODES` in `@aitrader/contracts`.
- Every error response is `{ code, message, details?, requestId }`. Never leak stacks, SQL or secrets.
- Never swallow an error silently. Either handle it with a visible outcome (a typed reason, a `stale` flag) or let it reach the filter.

## 4. Web (`apps/web/src`)

- **Fetching:** server data goes only through TanStack Query hooks built on `shared/api/http.ts` (`apiFetch`). No `fetch` anywhere else.
- **UI state:** Zustand stores in `shared/state/` or `features/<f>/state/`. Browser storage is wrapped in `try/catch` and is a convenience only.
- **Live ticks never enter React state.** They go into `LiveStore`. Charts subscribe imperatively; text reads through `useLiveValue` (at most one render per frame).
- **Components:** components render; logic lives in hooks. Max 250 lines per `.tsx` file.
- **Theme:** colours come from CSS variables in `app/theme.css`. Never hard-code a colour in a component.
- **Every async view has a state for:** first load (skeleton), refreshing (keep content), empty (says why), error (says why, with a retry where it makes sense).

## 5. Code style

- Names say what things are. Small files with one responsibility. Functions over 40 lines need a reason.
- **Comments:** short, saying *what* or *why*. Never narrate history ("used to…", "this fixes…"). Delete removed code; never comment it out.
- **Reuse before writing.** Check `packages/*`, `apps/*/src/shared/` and `architecture/generated/jscpd.md` first. Copied logic above the jscpd threshold fails the build.
- **Files:** UTF-8 without BOM, LF line endings. On Windows, write files with your edit tool or `Set-Content -Encoding utf8NoBOM`, never PowerShell's default encoding.
- **Versions:** exact versions in `package.json` (no `^` or `~`). Latest stable unless the brief pins otherwise. TypeScript stays `~6.0` until NestJS and typescript-eslint support 7.

## 6. Tests

- **TDD:** write the brief's tests first, run them and see them fail, then implement.
- **Naming:** test names state behaviour (`rejects …`, `returns … when …`). Assert exact values from the brief or SRD.
- **Unit tests** are fast and deterministic: fake timers, injected clocks and random sources, no network.
- **Integration tests** (`*.int-spec.ts`) use Testcontainers for Postgres and Redis.
- **Coverage floors:** lines ≥ 90 in `modules/*/domain` and `packages/*`; ≥ 80 in `modules/*/application`.

## 7. Diagrams (`architecture/`)

- **Each task** that adds or changes a module or feature updates `architecture/features/<feature>/README.md`: its purpose, SRD IDs, and Mermaid sequence or state diagrams for the flows it touches.
- **Then run `pnpm diagrams`.** It regenerates `classes.mmd`, the dependency graph and the knip and jscpd reports; commit what it changes. `pnpm diagrams:check` fails if they are stale.
- **The manager** owns the LikeC4 model in `architecture/model/`; propose changes under Follow-ups.

## 8. Done means

`pnpm check` exits 0. That runs lint, typecheck, tests with coverage floors, dependency rules, knip, jscpd, `diagrams:check` and the build. The result file is written, and the brief's "Done when" list is all true.
