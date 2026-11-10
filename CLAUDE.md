@AGENTS.md

# Working here (any Claude, any account, any machine)

Read these before changing anything:
- `docs/TODO.md`: pending real-world tests (with what each needs) and remaining work.
- `docs/superpowers/plans/`: one plan per phase. Your task brief is in `docs/tasks/<ID>.md`.
- `docs/process/WORKFLOW.md`: the manager → employee flow.

## How work lands
- One branch per task: `task/<ID>-<slug>`. Never commit to `main` and never push `main`.
- While working, run only what you touched (AGENTS.md §8). Run `pnpm check:code` once at the end.
- Write `docs/tasks/<ID>.result.md`: what changed, tests added, anything left open, every judgment call.
- The manager reviews the diff and merges with `scripts/task/finish.sh` (it serializes gates across worktrees).

## Hard rules
- **Secrets:** never open, print or copy `.env` files or tokens. Use `.env.example` for key names.
- **The assistant never trades:** no tool or code path lets the agent place, modify or cancel orders, real or paper, or handle broker logins or tokens.
- **Zerodha:** never script around its CAPTCHA or login limits.
- **Numbers come from the server:** indicator values, levels and drawings are computed server-side from real bars, never by a model.
- **Don't loosen tests or budgets** to pass. Find the cause.
- **Comments:** terse, say why. No change-history narrative. Delete dead code; don't comment it out.

## Models (owner rule: save usage limits)
- Default to **Sonnet**. Use **Haiku** for search and file-reading subagents.
- Use **Opus** only for real design work the brief marks as such. Don't spawn Opus subagents.

## Ownership while two agents work in parallel
| Owner | Paths |
|---|---|
| Worker (Phase 4) | `apps/api/src/modules/indicators/**`, `apps/web/src/features/indicators/**`, `packages/contracts/src/indicator.ts`, live indicator socket in `apps/api/src/modules/live/**`, Pine runtime |
| Manager | `apps/api/src/modules/agent/**`, `services/compute/**`, `packages/compute-client/**`, Phases 8–11, `scripts/**`, `docs/TODO.md` |

Shared files (`package.json`, `pnpm-lock.yaml`, `apps/api/drizzle/**`): change only when the brief says so. On a migration-number clash, the branch that merges second renumbers.
