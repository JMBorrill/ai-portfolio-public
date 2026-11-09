#!/bin/sh
# Builds the Criteria Chat demo from a local clone, at the commit pinned in COMMIT.
#   CRITERIA_APPROVAL=/path/to/runtime-approval.json demos/criteria/build.sh /path/to/criteria-chat [output-dir]
# The output (default demos/criteria/site) is the app's source tree, which is its install, with the
# chat UI built. Its corpus is fictional (three lenders); nothing is anonymised because nothing is real.
# CRITERIA_APPROVAL is the demo reviewer's runtime approval, written by `criteria-chat approve`;
# without it the demo runs but withholds every policy answer, by the app's own design.
# SYNC_PYTHON=1 (the default) also creates the backend environment for this machine; the Docker
# image makes its own.
set -eu
repo=${1:?usage: demos/criteria/build.sh /path/to/criteria-chat [output-dir]}
here=$(cd "$(dirname "$0")" && pwd)
out=${2:-$here/site}
source=$(mktemp -d)
trap 'rm -rf "$source"' EXIT
git -C "$repo" archive "$(cat "$here/COMMIT")" -- . ':!docs' ':!backend/tests' ':!backend/live_tests' ':!frontend/tests' | tar -x -C "$source"
(
  cd "$source/frontend"
  npm ci --no-audit --no-fund
  npm run build
  rm -rf node_modules
)
if [ -n "${CRITERIA_APPROVAL:-}" ]; then
  cp "$CRITERIA_APPROVAL" "$source/release/runtime-approval.json"
fi
rm -rf "$out"
mv "$source" "$out"
# After the move: an environment records its own location.
if [ "${SYNC_PYTHON:-1}" = 1 ]; then
  (cd "$out/backend" && uv sync --locked --no-dev)
fi
echo "Built $out$( [ -f "$out/release/runtime-approval.json" ] && echo ' (with runtime approval)' || echo ' (no approval: answers withheld)')"
