#!/bin/sh
# Measures the demo services' memory and /tmp under concurrent load: QRS_VISITORS busy QRS visitors
# and AIWS_VISITORS busy AIWS visitors (check/load.mjs), each in its own container with its own
# address, for DURATION seconds, through Caddy. Every second it samples each container's memory
# (cgroup: total, anonymous, tmpfs) and its /tmp; at the end it prints the peaks, any allocation
# failures or out-of-memory kills, and QRS's storage per workspace.
#   AIWS_DIR=/path/to/ai-workflow-studio deploy/measure.sh
# The limits are those in compose.yaml unless set: QRS_MEMORY=8g measures without QRS's limit
# getting in the way, and the recommended limits can then be checked with their own run.
set -eu
: "${AIWS_DIR:?Set AIWS_DIR to an ai-workflow-studio checkout (for the example the load runs).}"
here=$(cd "$(dirname "$0")" && pwd)
export SITE_HOST="jmborrill.co.uk" AIWS_HOST=studio.jmborrill.co.uk QRS_HOST=research.jmborrill.co.uk CADDY_OPTIONS=local_certs
QRS_VISITORS=${QRS_VISITORS:-6} AIWS_VISITORS=${AIWS_VISITORS:-4} DURATION=${DURATION:-180}
compose="docker compose -f $here/compose.yaml"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

$compose up -d --force-recreate --wait >"$work/up.log" 2>&1 || { cat "$work/up.log"; exit 1; }
$compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$work/root.crt" 2>/dev/null
echo "Limits: QRS ${QRS_MEMORY:-2g} memory, ${QRS_TMP:-512m} /tmp; AIWS ${AIWS_MEMORY:-512m}, ${AIWS_TMP:-16m}"

# The container's memory cgroup, v1 or v2.
cgroup() {
  id=$(docker inspect -f '{{.Id}}' "jmborrill-$1-1")
  for d in "/sys/fs/cgroup/memory/docker/$id" "/sys/fs/cgroup/system.slice/docker-$id.scope" "/sys/fs/cgroup/docker/$id"; do
    [ -d "$d" ] && { echo "$d"; return; }
  done
  echo "no memory cgroup found for $1" >&2; exit 1
}
# bytes in use, anonymous, tmpfs
memory() {
  if [ -f "$1/memory.usage_in_bytes" ]; then
    echo "$(cat "$1/memory.usage_in_bytes") $(awk '$1=="total_rss"{print $2}' "$1/memory.stat") $(awk '$1=="total_shmem"{print $2}' "$1/memory.stat")"
  else
    echo "$(cat "$1/memory.current") $(awk '$1=="anon"{print $2}' "$1/memory.stat") $(awk '$1=="shmem"{print $2}' "$1/memory.stat")"
  fi
}
tmp_used() { docker exec "jmborrill-$1-1" df -B1 /tmp | awk 'NR==2{print $3}'; }

qrs=$(cgroup qrs) aiws=$(cgroup aiws)
mib() { awk -v b="$1" 'BEGIN { printf "%.0f MiB", b / 1048576 }'; }
echo "Idle, before the load: qrs $(mib "$(memory "$qrs" | cut -d' ' -f1)"), aiws $(mib "$(memory "$aiws" | cut -d' ' -f1)")"
[ -f "$qrs/memory.max_usage_in_bytes" ] && echo 0 > "$qrs/memory.max_usage_in_bytes" && echo 0 > "$aiws/memory.max_usage_in_bytes"
(
  while :; do
    echo "$(date +%s) qrs $(memory "$qrs") $(tmp_used qrs) aiws $(memory "$aiws") $(tmp_used aiws)"
    sleep 1
  done
) > "$work/samples" &
sampler=$!

caddy_ip=$(docker inspect -f '{{(index .NetworkSettings.Networks "jmborrill_edge").IPAddress}}' jmborrill-caddy-1)
prefix=${caddy_ip%.*}
start() { # service, host, address
  docker run -d --label jmborrill.load --network jmborrill_edge --ip "$prefix.$3" --add-host "$2:$caddy_ip" \
    -v "$here/check:/check:ro" -v "$work/root.crt:/root.crt:ro" -v "$AIWS_DIR/examples/lead-qualification:/example:ro" \
    -e NODE_EXTRA_CA_CERTS=/root.crt -e SERVICE="$1" -e HOST_NAME="$2" -e DURATION="$DURATION" \
    node:22-bookworm-slim node /check/load.mjs >> "$work/visitors"
}
i=0; while [ $i -lt "$QRS_VISITORS" ]; do i=$((i + 1)); start qrs "$QRS_HOST" $((110 + i)); done
i=0; while [ $i -lt "$AIWS_VISITORS" ]; do i=$((i + 1)); start aiws "$AIWS_HOST" $((140 + i)); done
echo "Load: $QRS_VISITORS QRS and $AIWS_VISITORS AIWS visitors for ${DURATION}s"
sleep "$DURATION"
while docker ps --filter label=jmborrill.load -q | grep -q .; do sleep 2; done
kill "$sampler"

peak() { awk -v c="$1" 'BEGIN { m = 0 } { if ($c > m) m = $c } END { print m }' "$work/samples"; }
echo "Peaks over $(wc -l < "$work/samples") one-second samples:"
for s in qrs:3 aiws:9; do
  name=${s%:*} c=${s#*:}
  dir=$(cgroup "$name")
  exact=$( [ -f "$dir/memory.max_usage_in_bytes" ] && cat "$dir/memory.max_usage_in_bytes" || cat "$dir/memory.peak")
  echo "  $name: memory $(mib "$exact") (kernel's peak; sampled $(mib "$(peak $c)")), of which anonymous $(mib "$(peak $((c + 1)))") and tmpfs $(mib "$(peak $((c + 2)))"); /tmp $(mib "$(peak $((c + 3)))")"
  if [ -f "$dir/memory.failcnt" ]; then echo "    allocation failures at the limit: $(cat "$dir/memory.failcnt"); out-of-memory kills: $(awk '$1=="oom_kill"{print $2}' "$dir/memory.oom_control")"
  else echo "    out-of-memory kills: $(awk '$1=="oom_kill"{print $2}' "$dir/memory.events")"; fi
done
echo "QRS workspaces at the end (their own files, without the shared dataset):"
docker exec jmborrill-qrs-1 sh -c 'for d in /tmp/qrs-demo/sessions/*/; do du -sb --exclude=datasets "$d" | cut -f1; done' | sort -n | awk '{ printf "  %.1f MiB\n", $1 / 1048576 }'
echo "What the visitors did (refusals are the limits at work):"
while read -r id; do echo "  $(docker inspect -f '{{.Config.Env}}' "$id" | grep -o 'SERVICE=[a-z]*' | cut -d= -f2) $(docker logs "$id" 2>&1 | tail -1)"; docker rm "$id" > /dev/null; done < "$work/visitors"
