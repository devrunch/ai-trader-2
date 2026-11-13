# Notes for coding agents

Read this once at the start of a task instead of exploring the repo. Open only the files you will change and the ones they import.

## Layout

- `packages/contracts`: zod schemas and types shared by the API and the web app. A change here needs `pnpm build:packages` before the apps see it.
- `packages/resilience`, `packages/compute-client`: small shared libraries.
- `apps/api/src/modules/<module>/{domain,application,infrastructure,api}`: NestJS, layered.
  - Another module is imported only through its `application/index.ts` (depcruise rule `module-public-api-only`).
  - Modules: admin-ops, agent, alerts, auth, calendar, compute, fundamentals, health, indicators, instruments, live, market-data, news, notifications, paper-trading, pine-scripts, screener, strategies, watchlists.
- `apps/api/src/shared`: config (`config/app-config.ts`, each env key optional, blank means off), errors, jobs (BullMQ scheduler), redis, sources (the only HTTP path for external data; see `docs/DATA-SOURCES.md`).
- Agent tools: `apps/api/src/modules/agent/application/*-tools.ts`, each built with `guardedTool`, registered in `agent.module.ts`. The system prompt is `agent/prompts/system.md`.
- `apps/web/src/features/<feature>`: React features. Another feature is imported only through its `index.ts`. Shared UI is in `apps/web/src/shared/ui`: `Page`, `PageHeader`, `Panel`, `Field`, `AiButton` (the gradient is only for AI entry points).
- `services/compute`: Python backtest service on AWS Lambda.

## Database

- Migrations live in `apps/api/drizzle/NNNN_name.sql` with an entry in `meta/_journal.json` (next `idx`, `when` greater than the previous one). Use the next free number.
- Every store has an integration spec in `apps/api/test/*.int-spec.ts`. They need Docker, which the employee container does not have: write them, and say "NOT RUN" in the result doc.

## Commands (run from the repo root, stdin from /dev/null)

- While working, run only the tests you touched: `pnpm --filter @aitrader/api exec vitest run <path>` or `pnpm --filter @aitrader/web exec vitest run <path>`.
- Typecheck one app: `pnpm --filter @aitrader/web typecheck`.
- The full gate, once at the end, with its output saved to a file:
  ```
  NODE_OPTIONS=--max-old-space-size=6144 sh -c 'pnpm build:packages && pnpm lint && pnpm typecheck && pnpm test && pnpm depcruise && pnpm knip && pnpm jscpd && pnpm build' > /tmp/gate.log 2>&1; echo $?
  ```
  Then read only the failure lines (`grep -nE "error|FAIL|Unused|clones" /tmp/gate.log | head`), never the whole log.
- Known gate failures:
  - **knip:** flags exports nothing uses. Un-export them.
  - **jscpd:** flags copied blocks. Share the code instead.
  - **Load-sensitive web tests:** some time out under a full parallel run. Re-run that file alone before changing it.

## Cost rules

- Use at most 2 parallel subagents, only for independent files, with exact file paths in their brief. Integrate the work yourself.
- Do not re-read a file you already have in context. Do not print large files or logs.
- Commit in small steps. Write the result doc last; its line limit is in the brief.
