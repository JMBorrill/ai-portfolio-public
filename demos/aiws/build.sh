#!/bin/sh
# Builds the demo image from a local clone of AI Workflow Studio, at the commit pinned in COMMIT.
#   demos/aiws/build.sh /path/to/ai-workflow-studio [image-tag]
# BUILD_CA=/path/to/ca.pem: trust that CA while building, on networks that intercept TLS.
# Adapted from JMBorrill/portfolio at 042649c (demos/build.sh).
set -eu
repo=${1:?usage: demos/aiws/build.sh /path/to/ai-workflow-studio [image-tag]}
tag=${2:-jmborrill-aiws-demo}
here=$(cd "$(dirname "$0")" && pwd)
source=$(mktemp -d)
trap 'rm -rf "$source"' EXIT
git -C "$repo" archive "$(cat "$here/COMMIT")" | tar -x -C "$source"
docker build ${BUILD_CA:+--secret id=build_ca,src="$BUILD_CA"} --build-context app="$source" -t "$tag" "$here"
