# Phase 7: Agent on Mastra

**Goal:** a trading assistant in the terminal's Chat tab. It reads data only through guarded tools; every number it states comes from a tool; every change it proposes is an action card the user confirms. It has no path to any order, broker or paper-account write.

**Spec:** SRD §7.5 FR-AG-1..9, FR-AG-17 (skills FR-AG-10..16 are Phase 8). Owner decisions D10 and D13 (no orders, no broker credentials anywhere near the agent).

**Architecture:** a new `agent` module in the Node API.
- **Mastra in-process:** `@mastra/core` (exact pin, release at least 14 days old). Tools are thin adapters over application services from other modules (`MarketDataService`, `GetQuote`, `SearchInstruments`, `IndicatorService`, `ReadPortfolio`, `RunBacktest`), called in-process, never over HTTP.
- **Chat route:** streaming through Mastra's AI SDK route behind the session cookie. The web uses `useChat` in the Chat side tab.

## Global constraints
- **No order tool, ever.** A test enumerates the agent's tools and fails on any write to a broker or a paper account.
- **Read tools validate** with Zod (canonical IDs), check the user may see the data, are rate-limited per user and per conversation, read stores or caches only (never a vendor), return data or a typed reason, and are logged with user, turn and arguments.
- **Budgets per turn:** rounds, wall clock and tokens, plus a per-user daily cap the admin can change.
- **Untrusted text stays data:** prompt text from tools (news, skill output, shared Pine) is never instructions. Tool results are wrapped and labelled.

## Tasks
| Task | What | SRD |
|---|---|---|
| **P7-1** Module and model | `agent` module; Mastra agent with a model provider port. Bedrock in prod (IAM role), with a fallback model per task. Turn budget and daily cap. Config keys, disabled cleanly when no model is configured | FR-AG-1, 2, 3 |
| **P7-1b** Prompt and skill registry | Prompts live in separate files (`modules/agent/prompts/<key>.md`), the reviewed defaults. Admin edits create **immutable versions**. **Diff** between any two versions; **undo** by activating an earlier one (recorded as its own entry); **reset** to the file default. Every turn records the prompt (and later skill) versions it used, so evals compare versions. A draft can be evaluated before it goes live | owner 2026-11-10 |
| **P7-2** Guarded read tools | `getBars`, `getQuote`, `searchInstruments`, `getIndicators`, `getPortfolio` (read-only), `runBacktest`; a shared guard (schema, authz, rate limit, audit log, typed reasons); a tool-enumeration test for "no orders" | FR-AG-4, 5, 6 |
| **P7-3** Chat stream and UI | Chat route (session-authenticated, CSRF on POST); web Chat tab with `useChat`; tool calls as cards (data used); errors and budget exhaustion shown plainly | FR-AG-8 |
| **P7-4** Memory | Threads per user; working memory (watchlist, risk settings, recent topics); thread list and rename/delete | FR-AG-9 |
| **P7-5** Action cards | Approval tools with suspend/resume. The first actions: add an indicator to the chart, change its settings, add to the watchlist. Card states: pending, applied, dismissed, expired (15 min), failed (reason). Idempotent apply. Modal where fields can be edited | FR-AG-17 |
| **P7-6** Server-computed drawings | The agent supplies intent (levels, trend lines over a range); the server computes them from bars; the chart draws them as a layer | FR-AG-6 |
| **P7-7** Safety and evals | A golden-conversation set; prompt-injection cases (a tool result asking for an order); budget and rate-limit tests; a live smoke test against the dev model | FR-AG-3..6 |

## Prompt and skill registry (owner request 2026-11-10)
- **Storage:** `prompt_versions(key, version, content, sha256, parent_version, message, author, created_at)` plus `prompt_heads(key, version)`. Versions are never edited or deleted, only appended, like commits.
- **Admin UI:**
  - a list of prompt keys with the active version;
  - an editor (save means a new version with a message);
  - side-by-side or unified diff between any two versions;
  - history with author and time;
  - "make active" (undo/redo) and "reset to file default".
- **Evals:** the golden-conversation set runs against any version (including a draft) and stores results by `(prompt sha, skill shas, model)`. Activation shows the last eval result for that version.
- **Skills (Phase 8) use the same registry:** the base version is the vendored upstream commit plus the patch hash. Admin edits to `SKILL.md` or references create versions; enable or disable per skill; every skill run records its version.
- **Safety:** the "no orders" rules are code-enforced (tools, source scan), never prompt-only, so no prompt edit can grant a write.

## Open input from the owner
- **Model access for development:** Bedrock credentials or region and model IDs (the old app used Bedrock), or another provider for local development. Until then the module starts disabled and the tests use a fake model.

## Review focus
1. A tool result that contains instructions ("place a buy order") never causes a write.
2. A number in a reply without a tool call that produced it is a failed eval.
3. A double-clicked action card applies once.
4. Budget exhaustion ends the turn with a clear message, not a partial or hanging stream.
5. Another user's portfolio is never readable through `getPortfolio`.
