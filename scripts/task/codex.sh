#!/usr/bin/env bash
# Run Codex on a task brief. The brief goes in on stdin: a prompt argument with an open stdin hangs.
set -euo pipefail
id="${1:?usage: codex.sh <id>}"
root="$(git rev-parse --show-toplevel)"; cd "$root"
brief="docs/tasks/${id}.md"; result="docs/tasks/${id}.result.md"
[ -f "$brief" ] || { echo "missing $brief" >&2; exit 1; }
case "$(git branch --show-current)" in task/${id}-*) ;; *) echo "not on task/${id}-* branch" >&2; exit 1;; esac
mkdir -p .superpowers/codex
codex exec -C "$root" -s workspace-write \
  -c sandbox_workspace_write.network_access=true \
  -o "$result.last-message.txt" - < "$brief" > ".superpowers/codex/${id}.log" 2>&1
status=$?
echo "codex exit ${status}; log .superpowers/codex/${id}.log"
[ -f "$result" ] && echo "result $result" || echo "WARNING: codex wrote no $result"
exit $status
