#!/usr/bin/env bash
# Finish a reviewed task: run checks, commit as Codex, merge --no-ff into main, delete the branch.
set -euo pipefail
id="${1:?usage: finish.sh <id> \"<commit message>\"}"; msg="${2:?usage: finish.sh <id> \"<commit message>\"}"
root="$(git rev-parse --show-toplevel)"; cd "$root"
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
if [ -f package.json ] && node -e "process.exit(require('./package.json').scripts?.check ? 0 : 1)"; then
  # The manager owns architecture/: regenerate from the branch's code, then run every gate.
  pnpm run build:packages && pnpm run diagrams
  pnpm run check
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
