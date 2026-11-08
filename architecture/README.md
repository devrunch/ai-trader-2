# Architecture diagrams

SRD §14 and AGENTS.md §7 define the diagram duties.
`model/` holds the manager-owned LikeC4 architecture model.
Run `pnpm diagrams:validate` to validate it.
Run `pnpm diagrams:serve` to explore context and container views interactively.
Run `pnpm diagrams:build` to create the ignored `site/` static site.
`features/<name>/README.md` describes feature flows and SRD requirements.
`features/<name>/classes.mmd` shows exported classes, interfaces and dependencies.
`generated/deps.mmd` shows collapsed code dependencies.
`generated/knip.md` reports unused code; `generated/jscpd.md` reports duplication.
Run `pnpm diagrams` after code changes; review all regenerated files.
Never edit generated files by hand.
Run `pnpm diagrams:check` to detect changed, new or removed generated files.
The check regenerates files and compares content hashes, including untracked files.
`pnpm check` validates the model and checks generated file freshness.

`model/system.c4` keeps hand-written actors, containers, external systems and architectural intent.
`model/generated.c4` is generated from source folders and dependency-cruiser imports; do not edit it.
`pnpm diagrams` regenerates it; `pnpm diagrams:check` rejects stale generated model content (SRD §14).
