#!/usr/bin/env bash
# Finish a reviewed task: run checks, commit as Codex, merge --no-ff into main, delete the branch.
set -euo pipefail
id="${1:?usage: finish.sh <id> \"<commit message>\"}"; msg="${2:?usage: finish.sh <id> \"<commit message>\"}"
root="$(git rev-parse --show-toplevel)"; cd "$root"
source "$root/scripts/lib/node-env.sh"
branch="$(git branch --show-current)"
case "$branch" in task/${id}-*) ;; *) echo "not on task/${id}-* branch (on $branch)" >&2; exit 1;; esac
rm -f "docs/tasks/${id}.result.md.last-message.txt"
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
