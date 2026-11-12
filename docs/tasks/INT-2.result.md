# INT-2 batch merge

Merged into task/INT-2-batch (from origin/main 517a538), in order: P9-7-india-events, DOC-1-deploy-todo, OPS-2-kite-failure, UI-4-home-login, P9-8-news-impact.

- OPS-2: tests passed in isolation; real defect was the journal (0024_pine_scripts missing) and the failure sanitiser missing cookie/authorization/api_key/public_token. Fixed and pushed on its branch. Int-spec not run (no Docker).
- UI-4: already green; no changes needed. Pushed branch unchanged.
- Conflict: `_journal.json` (news vs kite). Kept both; news impact migration renumbered 0024 -> 0026 (idx 23).
- Integration fixes: `india-schedule.ts` domain imported `application/` (depcruise) -> now uses the contracts type; `SessionState` in market-status.ts un-exported (knip).
- Gate: build:packages, lint, typecheck, test (no flaky failures this run), depcruise, knip, jscpd, build all pass after those two fixes (rerun from the failing step on). Docker int-specs not run.
