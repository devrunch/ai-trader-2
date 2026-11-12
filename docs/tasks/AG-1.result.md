# AG-1 trading skills

- Imported 11 skill prompts (`skill-*.md`), rewritten to our tools only: tradermonty/claude-trading-skills (MIT, 6202e67): vcp-setup, breakout-trade-plan, momentum-burst, earnings-reaction, backtest-review; SKE-Labs/agent-trading-skills (Apache-2.0, b14565f): breakout-trading, gap-trading, pullback-trading, momentum-trading; anthropics/financial-services (Apache-2.0, 6056506): sector-overview, idea-screen. Attribution and licences in `docs/third-party/skill-packs.md` and `LICENSE-Apache-2.0.txt`.
- Two subagents both wrote `skill-earnings-reaction`; the tradermonty version won, so no anthropics earnings skill (a gap). The two Apache repos state no copyright holder.
- `system.md`: pick a skill by name for trading questions and say which was used. `listSkills` already lists every `skill-*` prompt.
- Tests: `infrastructure/skill-prompts.spec.ts` (all skills load with title, summary, body; only tools registered in `application/` named in backticks; no scripts or URLs).
- Part 1: Telegram, ops dashboards, OTel/Sentry, zero-downtime deploys and diagram regeneration removed from `docs/GAP.md` and `docs/TODO.md` (one line each, counts updated). Gate: build:packages, lint, typecheck, test, depcruise, knip, jscpd, build all pass (one spec-threshold fix on the way).
