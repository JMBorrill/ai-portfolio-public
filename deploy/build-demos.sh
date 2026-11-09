#!/bin/sh
# Builds the client demos' and Criteria Chat's images on the host, from clones at their pinned commits.
#   deploy/build-demos.sh [/opt/src]
# /opt/src must hold clones of the two private client repositories and criteria-chat with the commits
# in demos/*/COMMIT fetched (`git fetch --all`), and the Criteria Chat reviewer's approval as
# /opt/src/criteria-runtime-approval.json (without it, that demo withholds every answer). The anonymising builds run
# in a Node container, so the host needs only Docker; the clones are not changed.
# BUILD_MEMORY (default 1500m) caps that container, so a build on a shared host cannot crowd out
# the sites already running there: if it runs short, the build fails, not them.
set -eu
src=${1:-/opt/src}
cd "$(dirname "$0")/.."
docker run --rm --memory "${BUILD_MEMORY:-1500m}" --memory-swap "${BUILD_MEMORY_SWAP:-3g}" -v "$PWD":/app -v "$src":"$src":ro -w /app node:22-bookworm sh -c "
  git config --global --add safe.directory '*' &&
  npm ci --no-audit --no-fund &&
  # The client demos' build steps are withheld from this public edition.
  SYNC_PYTHON=0 CRITERIA_APPROVAL=\$( [ -f $src/criteria-runtime-approval.json ] && echo $src/criteria-runtime-approval.json ) demos/criteria/build.sh $src/criteria-chat
"
docker build -t jmborrill-criteria-demo -f demos/criteria/Dockerfile demos
