#!/usr/bin/env bash
# Finish a reviewed task: run checks, commit as Codex, merge --no-ff into main, delete the branch.
set -euo pipefail
id="${1:?usage: finish.sh <id> \"<commit message>\"}"; msg="${2:?usage: finish.sh <id> \"<commit message>\"}"
root="$(git rev-parse --show-toplevel)"; cd "$root"
# One gate at a time across all worktrees: parallel integration suites on one machine skew timing budgets.
lock="$(git rev-parse --path-format=absolute --git-common-dir)/finish.lock"
until mkdir "$lock" 2>/dev/null; do echo "another gate is running ($(cat "$lock/owner" 2>/dev/null || echo unknown)); waiting. Stale? remove $lock" >&2; sleep 30; done
echo "$id $$" > "$lock/owner"; trap 'rm -rf "$lock"' EXIT
source "$root/scripts/lib/node-env.sh"
branch="$(git branch --show-current)"
case "$branch" in task/${id}-*) ;; *) echo "not on task/${id}-* branch (on $branch)" >&2; exit 1;; esac
rm -f "docs/tasks/${id}.result.md.last-message.txt"
# Check the code exactly as it will land: bring main in first. Generated files are rebuilt below, so their conflicts take main's copy.
if [ "$(git rev-list --count HEAD..main)" -gt 0 ]; then
  git add -A && { git diff --cached --quiet || git commit -q -m "wip: ${id} before merging main" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"; }
  if ! git merge -q --no-edit main; then
    conflicted="$(git diff --name-only --diff-filter=U)"
    if printf '%s
' "$conflicted" | grep -qv '^architecture/'; then
      git merge --abort; printf 'main conflicts with code on this branch; resolve by hand:
%s
' "$conflicted" >&2; exit 1
    fi
    printf '%s
' "$conflicted" | xargs git checkout --theirs -- && printf '%s
' "$conflicted" | xargs git add -- && git commit -q --no-edit
  fi
  pnpm install --frozen-lockfile
fi
if [ -f package.json ] && node -e "process.exit(require('./package.json').scripts?.['check:code'] ? 0 : 1)"; then
  # Owner decision 2026-11-10: code first. Merges gate on check:code; diagrams are regenerated in a separate batch
  # (pnpm diagrams && pnpm diagrams:check), so generated files never block a merge.
  pnpm run check:code
elif [ -f package.json ] && node -e "process.exit(require('./package.json').scripts?.test ? 0 : 1)"; then
  echo "no check script yet; running tests"; pnpm test
else
  echo "no check or test script yet; skipping checks"
fi
git add -A
if ! git diff --cached --quiet; then
  git commit -q --author "${AUTHOR:-Codex <codex@users.noreply.local>}" -m "$msg" -m "Reviewed-by: Claude (manager)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
fi
[ "$(git rev-list --count main..HEAD)" -gt 0 ] || { echo "nothing to merge" >&2; exit 1; }
git switch -q main
git merge -q --no-ff "$branch" -m "merge: ${branch}" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git branch -q -d "$branch"
git log --oneline --graph -5
