# Deploying on the existing VPS

The shared Caddy (`criteria-caddy-1`) already owns ports 80 and 443 and serves other sites, so this
runs the site and the demo services as containers it proxies to, instead of `../compose.yaml`'s
own Caddy. Each demo service has its own internal, no-route-out network; Caddy is attached to them.

| Host | Container | What |
| --- | --- | --- |
| `jmborrill.co.uk` | `jmborrill-site` | the portfolio (static export) |
| `studio.jmborrill.co.uk` | `jmborrill-aiws` | AI Workflow Studio |
| `research.jmborrill.co.uk` | `jmborrill-qrs` | the backtesting platform (Quant Research Studio) |
| `client1.jmborrill.co.uk` | `jmborrill-charity` | the anonymised charity website (pipeline withheld from this public edition) |
| `client2.jmborrill.co.uk` | `jmborrill-football` (+ `jmborrill-football-db`) | the anonymised schools football platform (pipeline withheld from this public edition) |
| `criteria.jmborrill.co.uk` | `jmborrill-criteria` | Criteria Chat ([demos/criteria](../../demos/criteria/README.md)) |

## Once: DNS and sources

1. Add A records for `client1.jmborrill.co.uk` and `client2.jmborrill.co.uk`, pointing at the VPS, as for `studio.` and `research.`.
2. In `/opt/src`, next to the existing clones, clone the two client repositories and `git fetch --all` in each so their pinned commits are present.

## Deploy or update

From the repository root on the host (`git pull` first):

```sh
demos/aiws/build.sh /opt/src/ai-workflow-studio
demos/qrs/build.sh /opt/src/quant-research-studio
deploy/build-demos.sh /opt/src            # the two client demos: anonymise, build, image
docker run --rm -v "$PWD":/app -w /app \
  -e NEXT_PUBLIC_AIWS_STUDIO_URL=https://studio.jmborrill.co.uk \
  -e NEXT_PUBLIC_QRS_STUDIO_URL=https://research.jmborrill.co.uk \
  -e NEXT_PUBLIC_CHARITY_SITE_URL=https://client1.jmborrill.co.uk \
  -e NEXT_PUBLIC_FOOTBALL_SITE_URL=https://client2.jmborrill.co.uk \
  -e NEXT_PUBLIC_CRITERIA_SITE_URL=https://criteria.jmborrill.co.uk \
  node:22-bookworm-slim sh -c "npm ci && npm run build"
docker compose -f deploy/vps/compose.yaml up -d
docker restart jmborrill-site    # the build replaces out/; the container must remount it
for n in aiws qrs charity football criteria; do docker network connect jmborrill_$n criteria-caddy-1 2>/dev/null || true; done
```

Run the builds niced (`nice -n 10`): `build-demos.sh` caps its own memory (`BUILD_MEMORY`, default 1500m), and the site build can take `--memory 1500m --memory-swap 3g` the same way, so the live sites on this host keep theirs.

Then make sure the shared Caddyfile contains every block in `Caddyfile.snippet` (new: `client1.` and `client2.`), validate and reload:

```sh
docker exec criteria-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec criteria-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

The network connections survive restarts of `criteria-caddy-1`, but not its recreation: reconnect if it is ever recreated.

**Going public.** The snippet has no password. If the shared Caddyfile still has `basic_auth` lines in the `jmborrill.co.uk`, `studio.` or `research.` blocks, remove them before reloading.

## Check

- `https://jmborrill.co.uk` loads without a password; each card's **Open the project** opens its demo.
- `https://client1.jmborrill.co.uk/healthz` and `https://client2.jmborrill.co.uk/healthz` answer `{"ok":true}`; `/staff/login` on `client1.` and `/admin/users` on `client2.` answer 404.
- `docker logs jmborrill-football` shows "Football demo data reset".
- `docker stats --no-stream`: the host has 3.8 GiB shared with other sites. The new containers are capped at 256 MiB (charity), 384 MiB (football) and 192 MiB (its database).

## Deployed 8 November 2026

At `9f3fb10`, on this VPS: both client demo images built (leak checks passed), the site rebuilt with all four demo addresses, `charity`, `football` and `football-db` started beside the existing containers (untouched), and the shared Caddyfile updated (backup in `/root/Caddyfile.backup-20261108-231245`): password and preview cookie removed, `client1.` and `client2.` added. Checked from outside over HTTPS: the site, `www.` redirect, both studios and `client2.` answer; a real backtest completes in the frame; a school signs in to the football demo in the frame; `/admin/users` on `client2.` is 404. `client1.` waits on its DNS record (it pointed at 34.143.61.167, not 37.143.61.167).

Later the same day, at `3437f19`: Criteria Chat added (`jmborrill-criteria`, `criteria.` in the shared Caddyfile; its source was copied to the host as a git bundle, as the host has no deploy key for that repository, and the reviewer's approval as `/opt/src/criteria-runtime-approval.json`), and the charity and football images rebuilt on the shared proxy. Football checked again from outside (a school signs in in the frame). `criteria.` waits on its DNS record.
