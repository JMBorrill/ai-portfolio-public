# Quant Research Studio demo service

The Quant Research Studio workspace on the portfolio is the studio itself. This service runs Quant Research Studio from the commit in `COMMIT` (`eb78cbb`), unmodified: its browser build (`apps/studio`), and its research engine (`qrs.api`, the job queue, the worker processes and NautilusTrader), behind `server.py`. The portfolio frames the studio and keeps its own explanations outside it.

`server.py` is adapted from `JMBorrill/portfolio` at `042649c`, which served QRS `7dcb178`; `references/sources.json` records what changed. Why `eb78cbb`, and the review of its newer API areas: `references/architecture.md`.

## How it fits together

```
portfolio page (static)          demo service (this directory)
  card → preview → workspace ──iframe──▶ /start    opens the visitor's session, or a new one
                                          /session  whether the session cookie came back
                                          /         the studio's own build (apps/studio/dist)
                                          /api/*    QRS's API, only the journey's endpoints, per visitor
```

- **Boundary.** A cross-origin iframe, as for AI Workflow Studio. The studio calls `/api` on the origin that served it.
- **Same site.** The `qrs_demo` session cookie (`HttpOnly; Secure; SameSite=Lax`, host-only) requires the portfolio and the service to share a registrable domain: in production, for example, `jmborrill.co.uk` and `research.jmborrill.co.uk`. `/start` checks the cookie through `/session` and explains if it is not kept.
- **Framing.** `Content-Security-Policy: frame-ancestors` with the origins in `QRS_FRAME_ANCESTORS`. Unset, nothing may frame it.

## The visitor's workspace

Each visitor gets their own complete QRS service, built by QRS's own `create_app` over a private directory, with its own SQLite store, run queue and worker process. Every directory links to one shared dataset, which no allowed endpoint writes (it is not read-only at the filesystem level): the synthetic dataset `qrs demo` creates (seed 42, 500 sessions). A session starts, as `qrs demo` does, with the EMA crossover template on that dataset. The preload is therefore server-side; nothing is written into the visitor's browser.

- **Only `/start` creates sessions.** The portfolio's frame opens it. An API request without a session is refused (403), except the three reads the studio makes on loading; it is never given a new one, so a client that drops cookies cannot mint sessions.
- **Only from a frame on the same site.** `/start` refuses (and creates or resets nothing) when the browser says it was loaded as anything but a frame (`Sec-Fetch-Dest`), or by another site (`Sec-Fetch-Site: cross-site`). So an image, a link or another site's page cannot open or reset a visitor's session. Clients that send neither header are not browsers, and the per-client limits below apply to them.
- **Reset** (confirmed in the workspace bar) loads `/start?reset`, which opens a new session and only then ends the old one, deleting its directory. A refused Reset leaves the session as it was.
- **Several tabs** share the session. QRS refuses a save based on an outdated revision and reports it, so tabs cannot silently overwrite each other. After a Reset, other open tabs still show the old strategy, which the new session does not have (404), until they reload the workspace.
- **Sessions end** after 30 minutes idle, or are reclaimed after 2 minutes idle when the service is full (never while a run is queued or running).

## Only the demonstrated journey

| Allowed | Why |
| --- | --- |
| `GET /api/operators`, `/api/templates`, `/api/datasets`; `POST /api/compile` | The studio loads these at start; compile runs on every edit. No session needed |
| `GET /api/strategies`, `GET`/`PUT /api/strategies/{id}` | Open and edit the strategy; every save is a numbered revision |
| `POST /api/strategies/{id}/runs`, `GET /api/runs`, `GET /api/runs/{id}`, `POST /api/runs/{id}/cancel` | Run a backtest, follow it, cancel it |
| `GET /api/runs/{id}/result`, `GET /api/runs/{id}/log` | Inspect the results and the worker's log |
| `GET /api/strategies/{id}/export` | Export the standalone Python bundle |

Everything else gets 404 with "This part of Quant Research Studio is not available in the demo.", which the studio shows. That covers:
- new strategies, Re-run, comparisons and experiments;
- the research areas (projects, families, analyses, methods, reports);
- dataset import;
- FastAPI's `/docs`.

## Limits

- **Execution.** One run at a time per session, in QRS's worker process, stopped by QRS after 60 seconds. At most 40 runs per session; then Reset.
- **Storage.** A session's own files (store, runs, exports; not the shared dataset) are capped at 64 MB; saves and runs beyond that are refused (507).
- **Lifetime.** A session ends after 30 minutes idle, or after an hour however active (`QRS_DEMO_LIFETIME_SECONDS`), never while a run is in progress. The visitor's next workspace opens fresh.
- **Requests.** JSON bodies only (a CORS preflight is never granted), at most 1 MB. 30 writes a minute per session and 300 overall; writes are posts, puts and exports (an export builds a bundle, so it also counts against the storage cap).
- **Sessions.** 6 by default (`QRS_DEMO_SESSIONS`), and 30 new sessions a minute. Per client: at most 3 sessions (`QRS_DEMO_SESSIONS_PER_CLIENT`) and 6 new sessions a minute. A client is an IPv4 address, or an IPv6 /64 (which one subscriber usually holds whole). A client's fourth session replaces only one of its sessions that has made no request for 2 minutes; otherwise it is refused with "Too many workspaces are open from your network". So one person cannot end another's workspace that is in use on a shared address (an office, a mobile network); a workspace left reading results for 2 minutes without a request can be replaced. One client holds at most half the service; two can hold all of it, for at most a session's lifetime (below), before they must open new ones. A client's refused attempts count only against its own limits, never against what visitors share.
- **Behind a reverse proxy**, set `QRS_CLIENT_IP_HEADER` to the header the proxy sets with the client's address: `x-forwarded-for` for Caddy. The last address in it is used, the one the proxy itself saw, so addresses a client adds are ignored whether the proxy replaces the header (Caddy's documented default, without `trusted_proxies`) or appends to it. Unset, the connection's address is used; set but missing, every request counts as one client, which fails safe.
- **Memory and `/tmp`, measured** (`deploy/measure.sh`, `references/test-evidence/release-readiness.md`): about 165 MiB idle, about 340 MiB with one visitor's backtests, and 976–996 MiB at the peak with 6 busy visitors; a workspace's files were about 0.5 MiB. The worst case for `/tmp` is 6 workspaces at the 64 MB cap plus the shared dataset, about 400 MiB, and tmpfs counts against the memory limit. Hence 2 GiB of memory and 512 MiB of `/tmp` (`deploy/compose.yaml`).

## No model providers

QRS can call hosted model providers (Anthropic, Ollama) in one place only: recording extraction responses (`extraction.record_missing`). That path is reached only by the command line's `--record`. Template preparation replays recorded responses with `record=False`, and dataset import is refused here anyway. The `qrs.providers` package is imported (through `qrs.templates`), but no adapter module is.

This is checked, not assumed:
- **The call sites (`server.test.mjs`).** A test parses QRS's source and lists every call of `providers.adapter`, `extraction.record_missing` and `extraction.extract`. There are four: `record_missing` calls `adapter`; `extract` calls `record_missing` only inside `if record:`; the CLI passes `record=args.record`; template preparation passes no `record`. Any new call site fails the test.
- **Modules (`server.test.mjs`).** Loading the service, its worker, the simulation and export modules loads no provider adapter and no network client (`anthropic`, `httpx`, `requests` and others).
- **A tripwire (`server.test.mjs`).** In the service's own process, `adapter` and `record_missing` are replaced by functions that fail, and every socket connection is recorded. Every allowed endpoint is then called through the service, including a real backtest, its results, log and export, and a cancel. Nothing asks a provider and no connection is made; a control connection shows the recording works.
- **The worker processes (`check-network.sh`).** Backtests run in QRS's worker processes, outside that tripwire. The service tests (real backtests, results, export) pass in a network namespace with only loopback. A journey under `strace` (edit, backtest, result, log, export) makes no `connect`, `sendto` or `sendmsg` addressed beyond loopback or a local socket, across the service and all its processes. A control confirms the check catches an outbound TCP connection and a UDP datagram.
- **The image.** It installs QRS's locked environment without development dependencies (`uv sync --frozen --no-dev`), which leaves out the Anthropic SDK (QRS's optional `hosted` extra) and `httpx`. Checked in the built image: neither can be imported. The tests above ran in the development environment, which includes them.

In production the container also runs on a network with no outbound route.

## Run it locally

Set up a checkout at the pinned commit (Python 3.12, uv, Node):

```sh
git clone https://github.com/JMBorrill/quant-research-studio && cd quant-research-studio
git checkout "$(cat /path/to/ai-portfolio/demos/qrs/COMMIT)"
uv sync --frozen && (cd apps/studio && npm ci && npm run build)
```

Then, from this repository:

```sh
QRS_DIR=/path/to/quant-research-studio PORT=8766 QRS_FRAME_ANCESTORS=http://localhost:4173 npm run demo:qrs
NEXT_PUBLIC_QRS_STUDIO_URL=http://localhost:8766 npm run build && npm run serve   # open http://localhost:4173
```

Open the Quant Research Studio card and choose **Open the project**, or go to `/#quant-research-studio/workspace`. Use `localhost` for the site, so it is the same site as the service.

## In production (not deployed)

The proposed hosting runs this service, the AI Workflow Studio service and the static site on one host, behind Caddy, with the service on an internal network that has no route out: [deploy/README.md](../../deploy/README.md). It also has the checks of the built image, through the proxy and in three browsers.

On a build network that intercepts TLS, give the build its CA with `BUILD_CA=/path/to/ca.pem demos/qrs/build.sh …`; it is mounted as a build secret and is not part of the image.

## Tests

```sh
QRS_DIR=/path/to/quant-research-studio npm run test:qrs            # service tests; start their own services
QRS_DIR=/path/to/quant-research-studio npm run check:qrs-network   # needs Linux, root and strace
NEXT_PUBLIC_QRS_STUDIO_URL=http://localhost:8766 npm run build
QRS_DIR=/path/to/quant-research-studio npm run e2e                 # the portfolio and the real studio inside it
```

## Studio behaviour to know

- **Narrow screens.** The studio's side panels have fixed widths. Below 760 pixels (measured in Chromium) they cover the canvas, so nodes cannot be tapped to edit; tablets in portrait, from 768 pixels, can edit. Running, results and export work at any width. The studio is unmodified, so the portfolio says this before entry: in the preview, and in the workspace's mode strip for visitors arriving by a direct link, on narrow screens only. The browser tests skip editing below 760 pixels and say why.
- **Header buttons.** The studio shows *New strategy…*, *Import CSV…*, *Compare runs…*, *Research…* and *Experiments…*. Their actions are refused here, with the message above.
- **Log link.** *Log* opens in a new tab, at the service's own address.
- **Health check.** `/healthz` alone may be read from any origin, so the workspace can tell a stopped service from a running one behind a proxy, which answers for it with an error.
- **Cancel.** The studio sends `Content-Type: application/json` with every request, a cancel included, so the JSON-only rule does not get in its way.

## Updating the pin

Change `COMMIT`, set up the checkout, review any API endpoints the studio has gained since, then run the service tests, the network check and the browser tests. The recorded hashes in `server.test.mjs` come from QRS's `scripts/check-hashes.py` and are compared on Linux x86_64.
