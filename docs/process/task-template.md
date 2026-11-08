# Task <ID>: <title>

Read `AGENTS.md` first. It's binding. Do only what this brief asks.

## Goal
<one sentence>

## SRD
<requirement and failure-mode IDs this task covers>

## Files
- Create: <exact paths>
- Modify: <exact paths>
- Test: <exact paths>

## Interfaces
- Consumes: <exact names and signatures from earlier tasks>
- Produces: <exact names and signatures later tasks rely on>

## Tests to write first
<test names with the exact assertions and values>

## Steps
1. Write the tests above. Run them and confirm they FAIL; paste the failure tail into the result file.
2. Implement.
3. Run the tests, then `pnpm check`, then `pnpm diagrams`. All must pass.
4. Write `docs/tasks/<ID>.result.md` (AGENTS.md §0).

## Commands
<exact commands and the expected output>

## Done when
<checkable list>

## Out of scope
<what not to touch>
