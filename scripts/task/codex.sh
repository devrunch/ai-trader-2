#!/usr/bin/env bash
# Run Codex on a task brief, or resume the last session with review notes.
#   codex.sh <id>                 run the brief docs/tasks/<id>.md
#   codex.sh <id> --resume <file> resume the last Codex session with the notes in <file>
# Input always comes on stdin: a prompt argument with an open stdin hangs.
set -euo pipefail
id="${1:?usage: codex.sh <id> [--resume <notes-file>]}"
root="$(git rev-parse --show-toplevel)"; cd "$root"
source "$root/scripts/lib/node-env.sh"
brief="docs/tasks/${id}.md"; result="docs/tasks/${id}.result.md"
case "$(git branch --show-current)" in task/${id}-*) ;; *) echo "not on task/${id}-* branch" >&2; exit 1;; esac
mkdir -p .superpowers/codex

# Owner decision 2026-11-08: no sandbox. The Windows sandbox blocks pnpm locks, SWC and Docker.
# AGENTS.md forbids Codex from committing, merging or touching files outside the repo.
opts=(--dangerously-bypass-approvals-and-sandbox)

status=0
if [ "${2:-}" = "--resume" ]; then
  notes="${3:?usage: codex.sh <id> --resume <notes-file>}"
  n=$(ls .superpowers/codex/"${id}".resume*.log 2>/dev/null | wc -l)
  log=".superpowers/codex/${id}.resume$((n + 1)).log"
  codex exec resume --last "${opts[@]}" - < "$notes" > "$log" 2>&1 || status=$?
else
  [ -f "$brief" ] || { echo "missing $brief" >&2; exit 1; }
  log=".superpowers/codex/${id}.log"
  codex exec -C "$root" "${opts[@]}" - < "$brief" > "$log" 2>&1 || status=$?
fi
echo "codex exit ${status}; log ${log}"
[ -f "$result" ] && echo "result $result" || echo "WARNING: codex wrote no $result"
exit $status
