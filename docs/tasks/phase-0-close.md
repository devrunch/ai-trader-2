# Phase 0 close — 2026-11-08

## Delivered
| Task | Merge | What |
|---|---|---|
| T-002 | `3caf0e5` | pnpm workspace: NestJS 12 API, Vite 8 + React 19.3 web, `contracts` and `resilience` packages, Node 26.13 LTS |
| T-003 | `0c4335d` | `pnpm check`: ESLint (no `any`, no stray `process.env`), dependency-cruiser layer rules R-1..R-8 and R-12 (each proven by a fixture), knip, jscpd, coverage floors |
| T-004 | `e6b9334` | Diagrams: class diagrams generated with ts-morph, the dependency graph, knip and jscpd reports, the LikeC4 model, the staleness check |
| T-005 | `c1f14cf` | Typed config; one env reader; errors list every bad key and never echo values |
| T-006 | `c97c2ec` | Shared error codes and body; DomainError hierarchy; a global filter with no leaks |
| T-007 | `a32e41f` | pino JSON logs with request ids; `/health`; `/ready` with a readiness registry |
| T-008 | `b80f3ba` | Resilience: backoff, retry, timeout, circuit breaker, token bucket (100% coverage) |
| T-009 | `b219624` | Postgres 18 (Drizzle) and Redis 8: outage and recovery proven with Toxiproxy containers |
| T-010 | `6e83bd4` | Web shell: typed routes, API client, theme tokens, responsive terminal layout (180 KB gzipped initial JS) |
| T-011 | `476a2f3` | `LiveStore`: per-frame coalescing; `useLiveValue` renders once per frame |
| T-012 | `461caf9` | Shared app setup (no `x-powered-by`), silent test logs, a dependency graph of our own code only, stable diagram tests |

**Tests at close:** 108 unit, 7 integration. `pnpm check` was green 5 times in a row on the final merge.

## Screens
- LikeC4, API components: `assets/phase-0-likec4-api.png`
- Web terminal shell (`/terminal?symbol=NSE:RELIANCE&interval=15`): `assets/phase-0-web-terminal.png`

## Rulings made during the phase
- Codex runs without a sandbox (owner decision). The Windows sandbox blocked pnpm locks, SWC and Docker. AGENTS.md §0 confines Codex to the repo.
- pnpm is pinned to 10.34.9, not 12.18: pnpm 10 can't launch pnpm 12's native binary on Windows.
- Node 26.13 LTS (owner decision) runs from the nvm folder via `scripts/lib/node-env.sh`; the system Node 22.14 is untouched.
- ESLint `no-extraneous-class` uses `allowWithDecorator` (for Nest modules).
- Redis `commandTimeout` is 1 s by default (fail fast).
- `apiFetch` has a 15 s default timeout (AGENTS §2).

## Carried into Phase 1
- TanStack Router JSON-quotes search values (`interval=%2215%22`). Fixed in P1-7.

## Final review
The manager reviewed every task branch against the WORKFLOW checklist and reran `pnpm check` before each merge. Two branches were sent back (T-002: Node version; T-012: a flaky test). No separate whole-branch reviewer was spawned (session rules); this is a self-review by the manager.
