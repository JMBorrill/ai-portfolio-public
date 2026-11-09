"""Demo service for Quant Research Studio, framed by the portfolio's workspace.

Each visitor gets their own complete QRS service, built by the unmodified `qrs.api.create_app` over
a private directory: its own SQLite store, run queue and worker process. Every directory links to
one shared set of datasets, which no allowed endpoint writes: the synthetic dataset `qrs demo`
creates. A session starts with the EMA crossover template on that dataset, as `qrs demo` does.

In front of the services sits an allowlist of only the QRS endpoints the demonstrated journey needs
(edit a strategy, run a backtest, inspect its results and log, export), with limits on bodies,
request rates, run time, runs and storage per session, and the number of live sessions. Sessions
are created only by /start, which the portfolio's frame opens. Dataset import, new strategies,
experiments, comparisons and the research areas are not offered, and no extension modules load:
visitors send strategy graphs of QRS's own operators, which QRS validates and compiles.

Adapted from JMBorrill/portfolio at 042649c (demos/qrs/server.py), for QRS at demos/qrs/COMMIT.

    QRS_DIR checkout's Python:  python demos/qrs/server.py
    (PORT, HOST, QRS_DEMO_HOME, QRS_FRAME_ANCESTORS, QRS_CLIENT_IP_HEADER; for sizing and tests
    QRS_DEMO_SESSIONS, QRS_DEMO_SESSIONS_PER_CLIENT, QRS_DEMO_RUN_SECONDS, QRS_DEMO_RUNS_PER_SESSION,
    QRS_DEMO_SESSION_BYTES, QRS_DEMO_RECLAIM_SECONDS and QRS_DEMO_LIFETIME_SECONDS)
"""

import ipaddress
import json
import os
import re
import secrets
import shutil
import tempfile
import threading
import time
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import parse_qs

os.environ.pop("QRS_OPERATOR_MODULES", None)  # before qrs reads it: built-in operators only

import uvicorn  # noqa: E402
from qrs import datasets, templates  # noqa: E402
from qrs.api import STUDIO_DIST, create_app  # noqa: E402
from qrs.store import Store  # noqa: E402
from starlette.exceptions import HTTPException  # noqa: E402
from starlette.staticfiles import StaticFiles  # noqa: E402

# Each session runs one backtest at a time, in a worker of about 175 MiB (deploy/measure.sh), so the
# number of sessions sizes the host. Tests raise it, and lower the run and storage limits to reach them.
SESSIONS = int(os.environ.get("QRS_DEMO_SESSIONS", 6))
LIMITS = {
    "sessions": SESSIONS,
    "run_seconds": float(os.environ.get("QRS_DEMO_RUN_SECONDS", 60)),
    "body_bytes": 1_000_000,
    "posts_per_session_per_minute": 30,
    "posts_per_minute": 300,
    "new_sessions_per_minute": 5 * SESSIONS,
    # Per client (an IPv4 address, or an IPv6 /64), so one client cannot hold or churn every
    # session. Half the sessions: people sharing an address (an office, a mobile network) can still
    # open several, and one client cannot take them all.
    "sessions_per_client": int(os.environ.get("QRS_DEMO_SESSIONS_PER_CLIENT", 3)),
    "new_sessions_per_client_per_minute": 2 * int(os.environ.get("QRS_DEMO_SESSIONS_PER_CLIENT", 3)),
    "runs_per_session": int(os.environ.get("QRS_DEMO_RUNS_PER_SESSION", 40)),
    "session_bytes": int(os.environ.get("QRS_DEMO_SESSION_BYTES", 64 * 1024 * 1024)),
    # A session can be reclaimed for a new visitor once idle this long, and is removed after
    # the second figure; never while it has queued or running work.
    "reclaim_after_seconds": float(os.environ.get("QRS_DEMO_RECLAIM_SECONDS", 120)),
    "expire_after_seconds": 1800,
    # However active, a session ends after an hour (once no run is in progress), so a client that
    # keeps polling cannot hold a session for good.
    "lifetime_seconds": float(os.environ.get("QRS_DEMO_LIFETIME_SECONDS", 3600)),
}
# Behind a reverse proxy every request comes from the proxy, so the client's address is read from
# the header the proxy sets (e.g. "x-forwarded-for"); unset, from the connection. The last address
# is used: the one the proxy itself saw, which a client cannot choose, whether the proxy replaces
# the header (Caddy's default) or appends to it.
CLIENT_IP_HEADER = os.environ.get("QRS_CLIENT_IP_HEADER", "").strip().lower()
# Space-separated origins allowed to frame the studio, e.g. "https://jmborrill.co.uk". None by default.
FRAME_ANCESTORS = os.environ.get("QRS_FRAME_ANCESTORS", "").strip() or "'none'"

HOME = Path(os.environ.get("QRS_DEMO_HOME") or tempfile.mkdtemp(prefix="qrs-demo-"))
SHARED = HOME / "shared"
DEMO_DATASET = datasets.create_synthetic(SHARED)  # the dataset `qrs demo` creates: seed 42, 500 sessions

# Reads that need no session (operators, templates, datasets, compiling a document) go to a
# service over the shared directory, whose job queue is never started.
public = create_app(SHARED, allowed_hosts=("*",))
studio = StaticFiles(directory=STUDIO_DIST, html=True)

ID = r"[A-Za-z0-9_-]{1,64}"
PUBLIC = {("GET", "/api/operators"), ("GET", "/api/templates"), ("GET", "/api/datasets"), ("POST", "/api/compile")}
ALLOWED = [
    ("GET", r"/api/strategies"),
    ("GET", rf"/api/strategies/{ID}"),
    ("PUT", rf"/api/strategies/{ID}"),
    ("POST", rf"/api/strategies/{ID}/runs"),
    ("GET", rf"/api/strategies/{ID}/export"),
    ("GET", r"/api/runs"),
    ("GET", rf"/api/runs/{ID}"),
    ("GET", rf"/api/runs/{ID}/(result|log)"),
    ("POST", rf"/api/runs/{ID}/cancel"),
]
ALLOWED = [(method, re.compile(pattern)) for method, pattern in ALLOWED]
RUN_START = re.compile(rf"/api/strategies/{ID}/runs")
# Export is a GET, but QRS records it as a read in the session's store and builds a bundle, so it
# counts as a write: against the session's request limit and its storage cap.
EXPORT = re.compile(rf"/api/strategies/{ID}/export")


class Session:
    def __init__(self, client: str):
        self.client = client
        self.home = HOME / "sessions" / secrets.token_hex(16)
        self.home.mkdir(parents=True)
        (self.home / "datasets").symlink_to(SHARED / "datasets")
        store = Store(self.home / "qrs.sqlite")
        self.strategy_id, _ = store.create_strategy(templates.instantiate("ema_crossover", DEMO_DATASET))  # as `qrs demo` does
        self.app = create_app(self.home, allowed_hosts=("*",), time_limit=LIMITS["run_seconds"])
        self.app.state.jobs.start()
        self.started = self.seen = time.monotonic()
        self.posts = (0, 0)  # (minute, count)

    def busy(self) -> bool:
        return any(run["status"] in ("queued", "running") for run in self.app.state.jobs.store.list_runs())

    def idle_for(self) -> float:
        return time.monotonic() - self.seen

    def runs(self) -> int:
        return len(self.app.state.jobs.store.list_runs())

    def bytes_used(self) -> int:
        """The session's own files: its store, run directories and exports; not the shared datasets."""
        total = 0
        for folder, dirs, files in os.walk(self.home):
            dirs[:] = [d for d in dirs if not (Path(folder) / d).is_symlink()]
            total += sum((Path(folder) / f).stat().st_size for f in files)
        return total

    def close(self):
        self.app.state.jobs.stop()
        shutil.rmtree(self.home, ignore_errors=True)


sessions: dict[str, Session] = {}
lock = threading.Lock()
counters = {"posts": (0, 0), "new_sessions": (0, 0)}  # name -> (minute, count)
new_by_client: dict[str, tuple[int, int]] = {}  # client -> (minute, count)


# Fixed one-minute windows, as (minute, count). Every limit is checked before any is counted, so
# requests refused by one limit use up none of the others: one client's refused requests cannot
# spend an allowance that other visitors share.
def this_minute(count: tuple[int, int]) -> int:
    return count[1] if count[0] == int(time.time() // 60) else 0


def plus_one(count: tuple[int, int]) -> tuple[int, int]:
    return (int(time.time() // 60), this_minute(count) + 1)


class Refusal(Exception):
    def __init__(self, status: int, message: str):
        self.status, self.message = status, message


def new_session(client: str, replacing: str | None = None) -> tuple[str, Session]:
    """A new session for `client`; with `replacing`, it takes that session's place (Reset). Room is
    made by ending this client's least recently used idle session over its cap, then any session
    idle long enough to reclaim. Nothing is ended unless the new session is created."""
    with lock:
        if len(new_by_client) > 10_000:
            new_by_client.clear()
        # A client's attempts count against its own limit, refused or not; only sessions actually
        # made count against the shared one.
        mine = new_by_client.get(client, (0, 0))
        if this_minute(mine) >= LIMITS["new_sessions_per_client_per_minute"]:
            raise Refusal(503, "Too many workspaces have been opened from your network. Try again in a minute.")
        new_by_client[client] = plus_one(mine)
        if this_minute(counters["new_sessions"]) >= LIMITS["new_sessions_per_minute"]:
            raise Refusal(503, "The demo is busy. Try again in a minute.")
        ending = [replacing] if replacing in sessions else []

        def others():
            return [(s.seen, key, s) for key, s in sessions.items() if key not in ending]

        if sum(s.client == client for _, _, s in others()) >= LIMITS["sessions_per_client"]:
            # Only a session idle long enough to reclaim makes way: the others may belong to other
            # people on the same network, part way through their work.
            own = [(seen, key) for seen, key, s in others() if s.client == client and s.idle_for() >= LIMITS["reclaim_after_seconds"] and not s.busy()]
            if not own:
                raise Refusal(503, "Too many workspaces are open from your network. Try again in a few minutes.")
            ending.append(min(own)[1])
        if len(others()) >= LIMITS["sessions"]:
            idle = [(seen, key) for seen, key, s in others() if s.idle_for() >= LIMITS["reclaim_after_seconds"] and not s.busy()]
            if not idle:
                raise Refusal(503, "The demo is busy. Try again in a minute.")
            ending.append(min(idle)[1])
        key = secrets.token_urlsafe(32)
        sessions[key] = session = Session(client)
        counters["new_sessions"] = plus_one(counters["new_sessions"])
        ended = [sessions.pop(old) for old in ending]
    for old in ended:
        old.close()
    return key, session


def expired(session: Session) -> bool:
    now = time.monotonic()
    return (now - session.seen >= LIMITS["expire_after_seconds"] or now - session.started >= LIMITS["lifetime_seconds"]) and not session.busy()


def expire_sessions():
    while True:
        time.sleep(min(60, LIMITS["lifetime_seconds"]))
        with lock:
            stale = [key for key, s in sessions.items() if expired(s)]
            closing = [sessions.pop(key) for key in stale]
        for session in closing:
            session.close()


def check_request(method: str, path: str, headers: dict, session: Session | None):
    """Everything that is refused before a request reaches QRS."""
    writes = method in ("POST", "PUT") or (method == "GET" and EXPORT.fullmatch(path))
    if method in ("POST", "PUT") and not headers.get("content-type", "").startswith("application/json"):
        # A JSON content type forces a CORS preflight, which is never granted.
        raise Refusal(415, "Send JSON.")
    if writes:
        with lock:
            allowed = this_minute(counters["posts"]) < LIMITS["posts_per_minute"]
            if session:
                allowed = allowed and this_minute(session.posts) < LIMITS["posts_per_session_per_minute"]
            if allowed:
                counters["posts"] = plus_one(counters["posts"])
                if session:
                    session.posts = plus_one(session.posts)
        if not allowed:
            raise Refusal(429, "Too many requests. Try again in a minute.")
        if session and session.bytes_used() > LIMITS["session_bytes"]:
            raise Refusal(507, "This workspace has reached its storage limit. Reset it to start again.")
    if session and method == "POST" and RUN_START.fullmatch(path) and session.runs() >= LIMITS["runs_per_session"]:
        raise Refusal(429, f"This workspace has run its {LIMITS['runs_per_session']} backtests. Reset it to start again.")


async def read_body(receive) -> bytes:
    body = b""
    while True:
        message = await receive()
        body += message.get("body", b"")
        if len(body) > LIMITS["body_bytes"]:
            raise Refusal(413, "The request is too large for the public demo.")
        if not message.get("more_body"):
            return body


def replay(body: bytes):
    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    return receive


SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"same-origin"),
    (b"content-security-policy", f"frame-ancestors {FRAME_ANCESTORS}".encode()),
]
COOKIE = "qrs_demo={}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax"


def with_headers(send, extra: list[tuple[bytes, bytes]]):
    async def wrapped(message):
        if message["type"] == "http.response.start":
            message["headers"] = list(message.get("headers", [])) + SECURITY_HEADERS + extra
        await send(message)

    return wrapped


async def respond(send, status: int, body: bytes, content_type: bytes, extra=()):
    headers = [(b"content-type", content_type), (b"cache-control", b"no-store"), *SECURITY_HEADERS, *extra]
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})


async def respond_json(send, status: int, body: dict, extra=()):
    await respond(send, status, json.dumps(body).encode(), b"application/json", extra)


def start_page(strategy_id: str | None, problem: str | None) -> bytes:
    """Checks that the session cookie came back, tells the framing page, then opens the strategy.
    Messages to the framing page carry no data from the studio: only whether it is ready."""
    return f"""<!doctype html>
<html lang="en-GB">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Opening Quant Research Studio</title>
<style>body{{margin:0;display:grid;place-items:center;min-height:100vh;padding:0 16px;background:#16171a;color:#e9e6df;font:16px/1.5 system-ui,sans-serif}}</style>
<p role="status" id="status">Opening Quant Research Studio…</p>
<script>
(async () => {{
  const tell = (type, detail) => parent !== window && parent.postMessage({{ source: 'qrs-studio', type, detail }}, '*');
  const fail = (message) => {{
    document.getElementById('status').textContent = 'Quant Research Studio could not be opened: ' + message;
    tell('error', message);
  }};
  const problem = {json.dumps(problem)};
  if (problem) return fail(problem);
  try {{
    // The visitor's session lives in a cookie. If this browser does not keep it in this frame (a
    // site and studio on different domains, or cookies blocked), find out now, before the studio.
    const session = await (await fetch('/session', {{ cache: 'no-store' }})).json();
    if (!session.cookie) return fail('this browser does not keep the studio’s session cookie inside this page, so your strategy and runs could not be found. The site and the studio must be served from the same domain, with cookies allowed.');
    tell('ready');
    location.replace('/#' + {json.dumps(strategy_id)});
  }} catch (e) {{
    fail(String((e && e.message) || e));
  }}
}})();
</script>
</html>""".encode()


def session_key(headers: dict) -> str | None:
    cookie = SimpleCookie(headers.get("cookie", "")).get("qrs_demo")
    return cookie.value if cookie else None


warned_missing_header = threading.Event()


def client_of(scope, headers: dict) -> str:
    """The client's address; for IPv6 its /64, which one subscriber usually holds whole."""
    if CLIENT_IP_HEADER:
        address = headers.get(CLIENT_IP_HEADER, "").split(",")[-1].strip()
        if not address and not warned_missing_header.is_set():
            warned_missing_header.set()
            print(f"warning: requests arrive without {CLIENT_IP_HEADER}; every visitor counts as one client. Is the proxy setting it?", flush=True)
    else:
        address = (scope.get("client") or ("",))[0]
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return "unknown"
    if ip.version == 6 and ip.ipv4_mapped:
        return str(ip.ipv4_mapped)
    return str(ipaddress.ip_network(f"{ip}/64", strict=False)) if ip.version == 6 else str(ip)


def framed_by_a_site_of_ours(headers: dict) -> bool:
    """Browsers say what a request is for. /start is loaded by the portfolio's frame, on the same
    site, so an image, a script, a top-level link or another site's page cannot open or reset a
    session. (Clients that send no such headers are not browsers; the per-client limits apply.)"""
    dest, site = headers.get("sec-fetch-dest"), headers.get("sec-fetch-site")
    return dest in (None, "iframe") and site in (None, "same-origin", "same-site")


async def start(scope, send, headers: dict):
    """Opens the visitor's workspace: their session, or a new one; with ?reset, a new one that
    replaces theirs, which is ended only once the new one exists."""
    key = session_key(headers)
    reset = "reset" in parse_qs(scope["query_string"].decode())
    with lock:
        session = None if reset else sessions.get(key)
    extra = []
    try:
        if not framed_by_a_site_of_ours(headers):
            raise Refusal(403, "Open the studio from the portfolio.")
        if session is None:
            key, session = new_session(client_of(scope, headers), replacing=key if reset else None)
            extra = [(b"set-cookie", COOKIE.format(key).encode())]
        session.seen = time.monotonic()
        page = start_page(session.strategy_id, None)
    except Refusal as refusal:
        page = start_page(None, refusal.message)
    await respond(send, 200, page, b"text/html; charset=utf-8", extra)


async def app(scope, receive, send):
    if scope["type"] == "lifespan":
        while (message := await receive())["type"] != "lifespan.shutdown":
            if message["type"] == "lifespan.startup":
                threading.Thread(target=expire_sessions, daemon=True).start()
                await send({"type": "lifespan.startup.complete"})
        with lock:
            for session in sessions.values():
                session.close()
        await send({"type": "lifespan.shutdown.complete"})
        return

    method, path = scope["method"], scope["path"]
    headers = {k.decode().lower(): v.decode() for k, v in scope["headers"]}
    try:
        if path == "/healthz":
            # Readable from any origin, so the portfolio can tell a stopped service from a running one.
            return await respond_json(send, 200, {"ok": True}, [(b"access-control-allow-origin", b"*")])
        if path == "/start" and method == "GET":
            return await start(scope, send, headers)
        if path == "/session" and method == "GET":
            with lock:
                known = session_key(headers) in sessions
            return await respond_json(send, 200, {"cookie": known})
        if not path.startswith("/api/"):
            if method != "GET":
                raise Refusal(404, "Not found.")
            try:
                return await studio(scope, receive, with_headers(send, []))
            except HTTPException:  # StaticFiles' not found, outside an application that would handle it
                raise Refusal(404, "Not found.") from None

        if (method, path) not in PUBLIC and not any(m == method and p.fullmatch(path) for m, p in ALLOWED):
            raise Refusal(404, "This part of Quant Research Studio is not available in the demo.")
        with lock:
            session = sessions.get(session_key(headers))
        # Only the reads the studio makes on loading work without a session. Everything else,
        # compile included, needs one, and is counted against it: requests without a session are
        # refused before they count against anything shared.
        if session is None and not (method == "GET" and (method, path) in PUBLIC):
            raise Refusal(403, "No workspace is open. Open the studio from the portfolio to start one.")
        body = await read_body(receive)
        check_request(method, path, headers, session)

        if (method, path) in PUBLIC:
            return await public(scope, replay(body), with_headers(send, []))
        session.seen = time.monotonic()
        await session.app(scope, replay(body), with_headers(send, []))
    except Refusal as refusal:
        await respond_json(send, refusal.status, {"detail": refusal.message})


if __name__ == "__main__":
    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", 8765)), server_header=False, log_level="warning")
