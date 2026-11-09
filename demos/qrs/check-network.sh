#!/bin/sh
# Checks that the demonstrated journey needs no network and makes no outbound connection:
#   1. the service tests (real backtests, results, export) pass in a network namespace that has
#      only loopback, as a container without outbound network would be;
#   2. a journey against the service under strace records every connect(), sendto() and sendmsg()
#      it and its worker processes make; any addressed to anything but loopback or a local socket
#      (a UDP datagram, such as a DNS lookup, included) fails the check.
# Needs Linux, root (for unshare -n) and strace.
#   QRS_DIR=/path/to/quant-research-studio demos/qrs/check-network.sh
set -eu
: "${QRS_DIR:?Set QRS_DIR to a quant-research-studio checkout at demos/qrs/COMMIT, set up.}"
here=$(cd "$(dirname "$0")" && pwd)
python="$QRS_DIR/.venv/bin/python"
log=$(mktemp)
# Stopping the traced server (strace's child) ends strace with it.
stop() { pkill -TERM -P "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; }
trap 'stop; rm -f "$log"' EXIT

echo "1. Service tests with loopback only"
unshare -n sh -c '
  python3 -c "
import socket, fcntl, struct
# Bring loopback up (SIOCSIFFLAGS: IFF_UP | IFF_LOOPBACK | IFF_RUNNING).
fcntl.ioctl(socket.socket(socket.AF_INET, socket.SOCK_DGRAM), 0x8914, struct.pack(\"16sH14s\", b\"lo\", 0x49, bytes(14)))
try:
    socket.create_connection((\"1.1.1.1\", 443), timeout=3)
    raise SystemExit(\"outbound network is reachable: not isolated\")
except OSError:
    print(\"   outbound unreachable, loopback up\")
"
  node --test "$0/server.test.mjs"
' "$here"

echo "2. A journey under strace"
trace="strace -f -qq -e trace=connect,sendto,sendmsg -o $log"
# The calls in the trace addressed to anything but loopback or a local socket.
outbound() { grep -E '(connect|sendto|sendmsg)\(' "$log" | grep -E 'AF_INET6?' | grep -vE 'inet_addr\("127\.|inet_pton\(AF_INET6, "::1"' || true; }
# Control: the check must catch outbound attempts when there are some, a TCP connection and a UDP
# datagram (192.0.2.1 is a documentation address).
$trace python3 -c 'import socket
s = socket.socket(); s.settimeout(0.2)
try: s.connect(("192.0.2.1", 9))
except OSError: pass
socket.socket(socket.AF_INET, socket.SOCK_DGRAM).sendto(b"x", ("192.0.2.1", 9))'
[ "$(outbound | grep -c 'inet_addr("192.0.2.1")')" = 2 ] || { echo "FAIL: the trace did not catch known outbound attempts"; exit 1; }
echo "   control: an outbound connection and datagram are caught"
: > "$log"
QRS_FRAME_ANCESTORS=http://localhost:4173 PORT=8811 $trace "$python" "$here/server.py" &
server=$!
python3 - <<'EOF'
import json, re, time, urllib.request
base = "http://127.0.0.1:8811"
for _ in range(150):
    try:
        urllib.request.urlopen(base + "/healthz"); break
    except OSError:
        time.sleep(0.2)
cookie = ""  # sent by hand: the session cookie is Secure, which a cookie jar keeps off plain HTTP
def call(method, path, body=None):
    global cookie
    req = urllib.request.Request(base + path, method=method, data=None if body is None else json.dumps(body).encode(), headers={"content-type": "application/json", "cookie": cookie})
    with urllib.request.urlopen(req) as res:
        cookie = (res.headers.get("set-cookie") or cookie).split(";")[0]
        data = res.read()
        return json.loads(data) if res.headers.get_content_type() == "application/json" else data
page = call("GET", "/start").decode()
strategy = re.search(r"location\.replace\('/#' \+ \"([^\"]+)\"\)", page).group(1)
record = call("GET", f"/api/strategies/{strategy}")
for node in record["document"]["nodes"]:
    if node["id"] == "fast":
        node["params"]["period"] = 14
call("POST", "/api/compile", {"document": record["document"]})
revision = call("PUT", f"/api/strategies/{strategy}", {"revision": 1, "document": record["document"]})["revision"]
run = call("POST", f"/api/strategies/{strategy}/runs", {"revision": revision})
while (run := call("GET", f"/api/runs/{run['id']}"))["status"] in ("queued", "running"):
    time.sleep(0.2)
assert run["status"] == "succeeded", run
call("GET", f"/api/runs/{run['id']}/result")
call("GET", f"/api/runs/{run['id']}/log")
bundle = call("GET", f"/api/strategies/{strategy}/export?revision={revision}")
assert bundle[:2] == b"PK"
print(f"   journey: edited to revision {revision}, backtest {run['status']}, result and log read, export {len(bundle)} bytes")
EOF
stop
total=$(grep -cE '(connect|sendto|sendmsg)\(' "$log" || true)
outbound=$(outbound)
echo "   connect, sendto and sendmsg calls by the service and its workers: $total; addressed to anything but loopback or a local socket: $(printf '%s' "$outbound" | grep -c . || true)"
if [ -n "$outbound" ]; then
  echo "$outbound"
  exit 1
fi
echo "PASS: no outbound connection; the journey works without a network."
