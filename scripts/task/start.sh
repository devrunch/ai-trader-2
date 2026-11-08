#!/usr/bin/env bash
# Start a task: branch task/<id>-<slug> from main and create its brief from the template.
set -euo pipefail
id="${1:?usage: start.sh <id> <slug>}"; slug="${2:?usage: start.sh <id> <slug>}"
root="$(git rev-parse --show-toplevel)"; cd "$root"
source "$root/scripts/lib/node-env.sh"
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean" >&2; exit 1; }
git switch -q main
git switch -q -c "task/${id}-${slug}"
brief="docs/tasks/${id}.md"
[ -f "$brief" ] || sed "s/<ID>/${id}/g" docs/process/task-template.md > "$brief"
echo "branch task/${id}-${slug}; brief ${brief}"
