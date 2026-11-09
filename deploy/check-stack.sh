#!/bin/sh
# Checks the production-shaped stack (compose.yaml) on this machine, under the production host names
# (jmborrill.co.uk, studio. and research.), which the check's containers resolve to this machine, with
# certificates from Caddy's own CA. The real names matter: browsers decide what is the same site from
# the public suffix list (co.uk), and WebKit does not treat subdomains of .localhost as one site.
#   1. the demo services have no route out;
#   2. two client containers on the public network, each with its own address, go through Caddy over
#      HTTPS: the full journey of each service (the images' smoke test), then client identification
#      with forged X-Forwarded-For headers (check/clients.mjs);
#   3. Chromium, Firefox and WebKit, from Playwright's image for the pinned version, use the
#      portfolio and both studios in the browser (check/browsers.mjs): embedding, cookies, storage,
#      Reset, and recovery when a service stops.
# Needs Docker with Compose, the images (demos/*/build.sh), AIWS_DIR for the example's data, and the
# site built for these names:
#   NEXT_PUBLIC_AIWS_STUDIO_URL=https://studio.jmborrill.co.uk \
#   NEXT_PUBLIC_QRS_STUDIO_URL=https://research.jmborrill.co.uk npm run build
#   AIWS_DIR=/path/to/ai-workflow-studio deploy/check-stack.sh
set -eu
: "${AIWS_DIR:?Set AIWS_DIR to an ai-workflow-studio checkout (for the example the journey runs).}"
here=$(cd "$(dirname "$0")" && pwd)
# elsewhere.test serves the same site from another site: the control for third-party cookies.
export SITE_HOST="jmborrill.co.uk, elsewhere.test" AIWS_HOST=studio.jmborrill.co.uk QRS_HOST=research.jmborrill.co.uk
export FRAME_ANCESTORS="https://jmborrill.co.uk https://elsewhere.test" CADDY_OPTIONS=local_certs
compose="docker compose -f $here/compose.yaml"
ca=$(mktemp)
trap 'rm -f "$ca" "$ca.log"' EXIT

echo "Starting the stack afresh"
$compose up -d --force-recreate --wait >"$ca.log" 2>&1 || { cat "$ca.log"; exit 1; }
$compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$ca" 2>/dev/null

echo "1. The demo services have no route out, nor to each other"
if $compose exec -T qrs /qrs/.venv/bin/python -c 'import socket; socket.create_connection(("1.1.1.1", 443), timeout=5)' 2>/dev/null; then
  echo "FAIL qrs reached 1.1.1.1:443"; exit 1
fi
if $compose exec -T aiws node -e 'fetch("https://registry.npmjs.org/", { signal: AbortSignal.timeout(5000) }).then(() => process.exit(0), () => process.exit(1))' 2>/dev/null; then
  echo "FAIL aiws reached registry.npmjs.org"; exit 1
fi
if $compose exec -T aiws node -e 'fetch("http://qrs:8765/healthz", { signal: AbortSignal.timeout(5000) }).then(() => process.exit(0), () => process.exit(1))' 2>/dev/null; then
  echo "FAIL aiws reached qrs"; exit 1
fi
echo "PASS neither service can open a connection out (an address, or a name to resolve), and AIWS cannot reach QRS"

echo "2. Two clients through Caddy"
caddy_ip=$(docker inspect -f '{{(index .NetworkSettings.Networks "jmborrill_edge").IPAddress}}' jmborrill-caddy-1)
# Fixed, different addresses: Docker would otherwise give the second the first's freed address.
prefix=${caddy_ip%.*}
for client in first:101 second:102; do
  role=${client%:*}
  echo "   the $role client, at $prefix.${client#*:}"
  docker run --rm --network jmborrill_edge --ip "$prefix.${client#*:}" --add-host "$AIWS_HOST:$caddy_ip" --add-host "$QRS_HOST:$caddy_ip" \
    -v "$here/check:/check:ro" -v "$ca:/root.crt:ro" -v "$AIWS_DIR/examples/lead-qualification:/example:ro" \
    -e NODE_EXTRA_CA_CERTS=/root.crt -e ROLE=$role -e AIWS_HOST -e QRS_HOST \
    node:22-bookworm-slim node /check/clients.mjs
done
echo "3. Browsers"
# A fresh start, so the browsers (all one client, from this machine) are not limited by step 2.
$compose restart aiws qrs >/dev/null 2>&1
$compose up -d --wait >/dev/null 2>&1
docker run --rm --network host --ipc host \
  --add-host jmborrill.co.uk:127.0.0.1 --add-host elsewhere.test:127.0.0.1 \
  --add-host "$AIWS_HOST:127.0.0.1" --add-host "$QRS_HOST:127.0.0.1" \
  -v "$here/..:/work:ro" -w /work -v "$(command -v docker):/usr/bin/docker:ro" -v /var/run/docker.sock:/var/run/docker.sock \
  -e BROWSERS mcr.microsoft.com/playwright:v1.63.0-noble node deploy/check/browsers.mjs
echo "Done. The stack is still running: docker compose -f deploy/compose.yaml down"
