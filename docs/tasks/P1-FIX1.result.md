# P1-FIX1 result

## What changed

- `apps/api/src/shared/jobs/job-scheduler.ts`: NFR-RB-5 / E22 manual pending marker with runtime + 60 s TTL, unique manual IDs, deterministic per-occurrence catch-up IDs, and abortable 250 ms lock polling bounded by runtime + 30 s. Clear pending only after lock acquisition, before the callback; preserve record-before-unlock ordering.
- `apps/api/test/jobs.int-spec.ts`: add the three requested manual-trigger regressions, replacing the obsolete active-run no-op expectation. Hold the heartbeat briefly to expose the record-before-unlock window deterministically. The throwing-job test remains unchanged.
- `architecture/features/foundation/README.md`: document pending, follow-up delivery and lock waiting in the Jobs state and sequence diagrams.
- `architecture/generated/jscpd.md`: regenerate source statistics with `pnpm diagrams`; no clones.
- `docs/tasks/P1-FIX1.result.md`: record implementation and validation evidence.

## Tests

Requirements: NFR-RB-5 (durable jobs), E22 (missed or hung jobs).

New regression names:

- `runNow right after a run finishes queues another run`
- `runNow during an active run queues exactly one follow-up`
- `concurrent runNow from two instances runs once`

Preserved unchanged: `a throwing job records failed and the next run still happens`.

Red command, before implementation:

```text
pnpm --filter @aitrader/api test:int test/jobs.int-spec.ts
```

Output tail (exit 1):

```text
Caused by: Error: Matcher did not succeed in time.
Test Files  1 failed (1)
     Tests  2 failed | 11 passed (13)
  Duration  30.28s (tests 95%, import 5%)
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
Exit status 1
```

Both the completion-window test and the active-run follow-up test observed 1 run instead of 2. Concurrent instances already passed.

Same command after implementation, exit 0:

```text
Test Files  1 passed (1)
     Tests  13 passed (13)
  Duration  13.75s (tests 88%, import 11%, transform 1%)
```

`pnpm diagrams`: exit 0, final line `Regenerated architecture diagrams and reports.`

Full validation command: `pnpm check`, run three times consecutively with no intervening implementation changes. All lint, typecheck, coverage, integration, dependency, unused-code, duplication, diagram validation/freshness and build stages passed.

```text
pnpm check #1: exit 0; 192 unit tests + 29 integration tests passed; API/web builds Done.
pnpm check #2: exit 0; 192 unit tests + 29 integration tests passed; API/web builds Done.
pnpm check #3: exit 0; 192 unit tests + 29 integration tests passed; API/web builds Done.
```

Final output tails:

```text
#1
apps/web build: ? built in 1.46s
apps/web build: Done
apps/api build: Done

#2
apps/web build: ? built in 1.21s
apps/web build: Done
apps/api build: Done

#3
apps/web build: ? built in 1.62s
apps/web build: Done
apps/api build: Done
```

The unchanged throwing-job test passed in all three full checks. Build output includes a non-failing web bundle size warning; no web changes were made.

`git diff --check`: exit 0, no output.

## Versions installed

None. Existing dependency versions and lockfile are unchanged.

## Deviations from the brief, and why

- Regenerated diagrams before the three full checks so `diagrams:check` validates the final source and documentation state.
- Replaced the old active-run no-op test because its expectation directly conflicts with the required follow-up behaviour.
- Documentation and generated-report edits are the explicit exceptions requested by the brief to its jobs-only implementation scope.

## Follow-ups

None identified within this task. No commits, merges or pushes performed.
