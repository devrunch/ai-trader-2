# Task P1-FIX1: runNow must never be silently dropped

Read `AGENTS.md` first. It's binding. Do only what this brief asks.

## Goal
`JobScheduler.runNow` de-duplicates *concurrent* triggers, but never drops a trigger that arrives after the previous manual run has finished. The test `a throwing job records failed and the next run still happens` must pass reliably under load.

## SRD
NFR-RB-5 (durable jobs), E22.

## Evidence (manager runs)
`apps/api/test/jobs.int-spec.ts > durable jobs > a throwing job records failed and the next run still happens` fails in 2 of 2 full `pnpm check` runs on this machine: the last run stays `failed`. That test calls `runNow` immediately after the first run's record appears.

## Root cause (in `apps/api/src/shared/jobs/job-scheduler.ts`)
1. **Reused job ID.** Every manual or catch-up delivery uses the fixed BullMQ job ID `'immediate'`. Right after a run records its outcome, that job can still exist (active or completing, before `removeOnComplete` removes it). `queue.add(…, { jobId: 'immediate' })` is then a silent no-op, and the trigger is lost.
2. **Early lock check.** `runNow` returns early when `jobs:<name>:lock` exists. `execute` writes the run record *before* it releases the lock in `finally`, so a trigger in that window is also lost.

## Required behaviour
- **Pending marker:** `runNow` sets a "pending manual run" marker atomically: `SET jobs:<name>:pending 1 NX PX <maxRuntimeMs + 60000>`.
  - If the marker was set: add a BullMQ job with a **unique** job ID (`manual-<uuid>`).
  - If the marker already existed: a trigger is already queued, so it's a no-op (this is the de-duplication).
- **Clearing the marker:** the worker clears `pending` when a manual delivery **starts** executing, before `run`. A `runNow` during an active run therefore queues exactly one follow-up run.
- **No lock check in `runNow`.** The per-run lock in `execute` still prevents concurrent execution across instances. A delivery that finds the lock held waits and retries until it acquires it (poll every 250 ms, up to `maxRuntimeMs + 30 s`) instead of silently returning, so a queued follow-up is never lost.
- **Catch-up deliveries** use a unique job ID too: `catchup-<scheduledAt>`, which is deterministic per occurrence, so two instances starting together still enqueue one catch-up.
- **Order of writes:** the run record is written before the lock is released (unchanged), which is fine now that `runNow` no longer reads the lock.

## Tests to write first (`apps/api/test/jobs.int-spec.ts`)
- `runNow right after a run finishes queues another run` (run, wait for its record, immediately call `runNow` → a second run happens within 10 s);
- `runNow during an active run queues exactly one follow-up` (a job taking 1 s; three `runNow` calls during it give 2 runs in total, not 4 and not 1);
- `concurrent runNow from two instances runs once`;
- keep `a throwing job records failed and the next run still happens` unchanged. It must pass.

## Steps
1. Write the tests and confirm they FAIL on the current code (paste the tail).
2. Implement.
3. Run `pnpm check` **three times in a row**; all must exit 0. Paste the three summary lines.
4. Update the Jobs section of `architecture/features/foundation/README.md`: the state diagram gains the `pending` marker. Run `pnpm diagrams`.
5. Write `docs/tasks/P1-FIX1.result.md`.

## Out of scope
Anything outside `shared/jobs` and its tests.
