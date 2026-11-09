# Hosting on a server of its own

The portfolio and all its demo services on one host, with this stack owning ports 80 and 443. **The owner is moving the site to a new server with this stack (8 November 2026); until then it runs on the existing VPS behind its shared Caddy, as described in [vps/README.md](vps/README.md).** The AIWS and QRS steps have been run on this machine under the production host names, as recorded in [references/test-evidence/release-readiness.md](../references/test-evidence/release-readiness.md), except the real certificates, DNS and a real host; the client demos' images have not been built yet.

```
internet ──443──▶ Caddy ── jmborrill.co.uk           the static site (out/), served by Caddy
                    │    ── studio.jmborrill.co.uk   ──▶ aiws:8080      ┐
                    │    ── research.jmborrill.co.uk ──▶ qrs:8765       │ an internal network each,
                    │    ── client1.jmborrill.co.uk  ──▶ charity:8080   │ no route out
                    │    ── client2.jmborrill.co.uk  ──▶ football:8080 ─┘ (+ its PostgreSQL)
                    └── Let's Encrypt (Caddy's only outbound traffic)
```

- **[compose.yaml](compose.yaml)** runs Caddy and the two images. Each demo service has an `internal` Docker network of its own, so it is reachable only through Caddy, not from the other service, and has no route out. The services run read-only, with no Linux capabilities, `no-new-privileges`, and memory, CPU, process and `/tmp` limits; Caddy runs read-only too, with only the capability to bind ports 80 and 443. All three restart unless stopped.
- **[Caddyfile](Caddyfile)** serves the site, with HSTS and other security headers, and proxies each studio. Caddy obtains and renews the certificates. By its documentation, Caddy sets `X-Forwarded-For` to the address it saw, ignoring whatever a client sent unless `trusted_proxies` is configured. The services read the last address in the header, so a client cannot choose its own identity whether the proxy replaces the header or appends to it (the stack check passes either way).
- **One registrable domain.** The services' session cookies are `SameSite=Lax` and host-only, so the site and both services must share `jmborrill.co.uk`. Browsers decide what is the same site from the public suffix list (`co.uk`), which is why the checks use the real names.

## Limits, from measurements

From `measure.sh`: 6 busy QRS visitors (the most it admits) and 4 busy AIWS visitors, for 3–4 minutes each run.

| Service | Measured peak | Limit | Why |
| --- | --- | --- | --- |
| QRS memory | 976–996 MiB (idle 165 MiB; one visitor 340 MiB) | 2 GiB | The worst case is about 1.6 GiB: all 6 workers at their peak (165 + 6 × 175 MiB) with `/tmp` full (about 400 MiB), which counts against memory. About 20% headroom |
| QRS `/tmp` | 16 MiB (workspaces 0.5 MiB each, plus the dataset) | 512 MiB | 6 workspaces at their 64 MB cap plus the dataset is about 400 MiB |
| QRS CPU | about 39 real backtests a minute on 2 CPUs | 2 | Each workspace runs one backtest at a time; more CPUs only shorten runs |
| AIWS memory | 117 MiB with clients that back off; 162 MiB with clients retrying refused requests at once (about 1,600 a second; an earlier version of `check/load.mjs`) | 512 MiB | The engine keeps each run for an hour, about 50 KB each, and up to 3,000 runs an hour: up to about 150 MB more |
| AIWS `/tmp` | 0 | 16 MiB | Unused |

No limit was reached in either run (no allocation failures or out-of-memory kills).

## Host and cost (estimates, November 2026)

The host needs about **3 GB of memory** for the containers (QRS 2 GiB, AIWS 512 MiB, Caddy about 50 MB) plus the operating system and Docker, and **2 vCPUs or more**. The images take about 0.5 GB on disk.

| Option | What | Estimated cost |
| --- | --- | --- |
| **Your existing VPS**, if it has about 3 GB of memory free, Docker with Compose, and ports 80 and 443 free | Nothing new | No additional cost |
| Hetzner Cloud CX33 (recommended if a new host is needed) | 4 vCPU, 8 GB, Germany or Finland | About €8.50–9 a month before VAT, with IPv4 |
| Hetzner Cloud CX23 (minimum) | 2 vCPU, 4 GB | About €5.50–6 a month; availability reported as uncertain |

The prices are from third-party summaries after Hetzner's 2026 increases, not Hetzner's console; check before ordering. The domain is already held. TLS from Let's Encrypt is free. There is no other paid service: no model API, database, CDN or analytics.

## Deploying on a new server

The owner is moving to a new server of their own (8 November 2026). This stack runs everything there, with its own Caddy on 80 and 443: the site, AI Workflow Studio, the backtesting platform (QRS), and the two anonymised client demos (charity website, schools football with its PostgreSQL).

**Size.** The containers' memory caps add up to about 4.2 GiB (QRS 2 GiB, AIWS 512 MiB, football 512 MiB and its database 256 MiB, charity 384 MiB, Caddy). A 4 GB server is too tight; 8 GB (for example Hetzner CX33: 4 vCPU, 8 GB, about €8.50–9 a month) leaves room for the system and Docker. Building the client demos needs about 2 GB of memory and 5 GB of disk while it runs.

1. **Server.** Ubuntu 24.04 or Debian 12 with Docker Engine and the Compose plugin ([Docker's install guide](https://docs.docker.com/engine/install/)). Firewall: allow only 22 (SSH), 80 and 443 inbound.
2. **DNS.** A records for `jmborrill.co.uk`, `www.jmborrill.co.uk`, `studio.`, `research.`, `client1.` and `client2.`, all pointing at the new server. Moving the existing names off the old server takes the old site down there; nothing else on the old server changes. Add no AAAA records (see below).
3. **Sources.** Clone this repository, and in `/opt/src` clone `ai-workflow-studio`, `quant-research-studio` and the two client repositories, then `git fetch --all` in each, so the commits pinned in `demos/*/COMMIT` are present. They are private: use a deploy key or a GitHub token on the server.
4. **Images.** From this repository's root:

   ```sh
   demos/aiws/build.sh /opt/src/ai-workflow-studio
   demos/qrs/build.sh /opt/src/quant-research-studio
   deploy/build-demos.sh /opt/src        # charity and football: anonymise, build, check, image
   ```

5. **Site.**

   ```sh
   docker run --rm -v "$PWD":/app -w /app \
     -e NEXT_PUBLIC_AIWS_STUDIO_URL=https://studio.jmborrill.co.uk \
     -e NEXT_PUBLIC_QRS_STUDIO_URL=https://research.jmborrill.co.uk \
     -e NEXT_PUBLIC_CHARITY_SITE_URL=https://client1.jmborrill.co.uk \
     -e NEXT_PUBLIC_FOOTBALL_SITE_URL=https://client2.jmborrill.co.uk \
     -e NEXT_PUBLIC_CRITERIA_SITE_URL=https://criteria.jmborrill.co.uk \
     node:22-bookworm-slim sh -c "npm ci && npm run build"
   ```

6. **Run.** `docker compose --env-file deploy/jmborrill.env -f deploy/compose.yaml up -d`. Caddy fetches certificates once DNS points here. There is no password.
7. **Check.**
   - `https://jmborrill.co.uk` loads; each card's **Open the project** opens its demo, and the backtest's Run completes.
   - `https://client1.jmborrill.co.uk/healthz` and `https://client2.jmborrill.co.uk/healthz` answer `{"ok":true}`; `/staff/login` on `client1.` and `/admin/users` on `client2.` answer 404.
   - `docker compose -f deploy/compose.yaml logs football` shows "Football demo data reset".
   - `docker compose -f deploy/compose.yaml exec qrs python -c "import socket; socket.create_connection(('1.1.1.1', 443), timeout=5)"` must fail.

Updating: `git pull`, rebuild what changed (step 4 or 5), and `up -d` again. Demo sessions and data live in memory, so a restart starts everyone afresh.

The charity and football images were written on a machine without Docker and have not yet been built or run; their apps and proxies were run and tested locally without containers.

## Residual risks

- **A determined client can still crowd out others.** QRS admits 6 workspaces: two addresses can hold all of them for up to an hour each, and someone with several IPv6 /64s (easy to obtain) or IPv4 addresses can keep doing so. The limits keep any one address to half and stop refused requests from spending what others share; they do not stop a distributed client. Caddy has no rate limiting without a plugin. If abuse appears, add a firewall rate limit, block the addresses, or raise the number of sessions on a larger host.
- **AIWS's hour.** 3,000 run starts an hour are shared, at most 300 per address: ten addresses could use the hour.
- **Shared addresses.** Visitors behind one address share its limits: 3 QRS workspaces, 60 AIWS posts a minute and 300 AIWS runs an hour.

## Checks

| Script | What it checks | Needs |
| --- | --- | --- |
| `check-stack.sh` | This stack under the production names, resolved to the machine, with Caddy's own certificates:<br>• the demo services cannot reach out;<br>• from two client containers with their own addresses, each service's whole journey through Caddy over HTTPS, using the built images, and forged `X-Forwarded-For` headers against both per-client limits;<br>• Chromium, Firefox and WebKit, at desktop size and as emulated phones: embedding, cookies, storage, Reset, recovery when a service stops, and a cross-site control | Docker with Compose, the images, `AIWS_DIR`, the site built for the production names |
| `measure.sh` | Memory and `/tmp` under concurrent load, with the limits in `compose.yaml` or overridden (`QRS_MEMORY`, `QRS_TMP`, `AIWS_MEMORY`, `AIWS_TMP`) | The same |
| `check/capture.mjs` | Captures the experience, on desktop and an emulated phone, from the running stack | The stack running, Playwright's image |

On a network that intercepts TLS, as in the development environment, pass the CA to the image builds with `BUILD_CA=/path/to/ca.pem`. It is mounted as a build secret and is not part of the images.
