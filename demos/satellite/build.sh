#!/bin/sh
# Rebuilds the Satellite Intelligence Lab viewer's images and figures from a lab checkout.
#   demos/satellite/build.sh /path/to/satellite-intelligence-lab [wide-cache]
# The lab must have run `sil acquire --project <p>` for mining, industrial, ports and energy.
# The wider crops are downloaded once into wide-cache (default: satellite-wide beside the lab).
# Writes public/projects/satellite-intelligence-lab/*.webp and content/satellite.json.
set -eu
lab=$(cd "${1:?usage: demos/satellite/build.sh /path/to/satellite-intelligence-lab [wide-cache]}" && pwd)
cache=${2:-$(dirname "$lab")/satellite-wide}
here=$(cd "$(dirname "$0")" && pwd)
site=$(cd "$here/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
"$lab/.venv/bin/python" -I "$here/build.py" "$lab" "$cache" "$work"
node "$here/publish.mjs" "$work" "$site/public/projects/satellite-intelligence-lab" "$site/content/satellite.json"
