# AI Workflow Studio demo service

The AI Workflow Studio workspace on the portfolio is the studio itself. This service runs AI Workflow Studio from the commit in `COMMIT` (`5af2c82`), unmodified: its browser build, and its engine behind `gateway.mjs`. The portfolio frames the studio and keeps its own explanations outside it.

The gateway is adapted from `JMBorrill/portfolio` at `042649c`, which already served the full studio; `references/sources.json` records what changed.

## How it fits together

```
portfolio page (static)          demo service (this directory)
  card → preview → workspace ──iframe──▶ /start  restores the example workspace in the browser
                                          /session   whether the session cookie came back (used by /start)
                                          /      the studio's own build (studio/dist)
                                          /engine/*  the engine, fixture mode only, per visitor
```

- **Boundary.** A cross-origin iframe. In the browser, the studio calls its engine at `/engine` on the origin that served it, so it is served from the service's own origin and is not rebuilt or altered. The portfolio passes it nothing and reads nothing from it; `/start` only tells the frame when the example is ready.
- **Same site.** The session cookie is `SameSite=Lax`, so the portfolio and the service must share a registrable domain: for example `jmborrill.co.uk` and `studio.jmborrill.co.uk`, or `localhost` on two ports locally. See [Origins, cookies and storage](#origins-cookies-and-storage).
- **Framing.** The service sends `Content-Security-Policy: frame-ancestors` with the origins in `AIWS_FRAME_ANCESTORS`. Unset, nothing may frame it.

## The example workspace

The studio keeps its projects, workflows and runs in the visitor's browser: SQLite, compiled to WebAssembly, stored in IndexedDB. To open with a useful workflow, `seed/studio.sqlite` holds the database the studio wrote after importing `examples/lead-qualification/workflow.json` (JMB lead qualification, with its fictional Priya Shah enquiry) through its own **Import** button. `make-seed.mjs` produces it by driving the real studio in a browser. Nothing is written by hand, so the file is in the studio's own format at the pinned commit.

`/start` writes that file into the studio's IndexedDB only when the browser has no studio workspace yet, then opens `#/workflows/wf_jmb_lead_qualification/test`. Opening the workspace again, in the same tab, another tab or on a later visit, never replaces what is there. So a visitor's edits and runs stay in their browser until they choose **Reset** in the workspace bar. Reset asks for confirmation (Cancel or Escape keeps the changes), then loads `/start?reset`, which writes the example back.

**One tab at a time.** The studio loads its whole workspace into memory and writes all of it back on every save. So two tabs with the studio open would each overwrite the other's edits, even seconds apart. The workspace therefore holds the studio in one tab of the site at a time:
- before a tab opens the studio, it claims the workspace on a `BroadcastChannel`;
- any other tab removes its frame and shows "open in another tab", with **Use it here** to take it back the same way;
- the studio saves pending edits when its tab is hidden and on `pagehide`, so switching tabs loses nothing.

Two-tab browser tests check this sequence: tab A edits, tab B opens and edits, A takes the workspace back and edits again, and a fresh tab finds all three edits.

**What it touches.** Only this service's own origin, the origin of the framed studio, and only one key: IndexedDB `ai-workflow-studio` → `files` → `studio.sqlite`, the studio's whole workspace. It reads that key, and writes it only on a first visit or a Reset. It never reads or writes the portfolio's storage, and the portfolio never reads the studio's. Give the service an origin of its own: a Reset replaces the whole database. The studio opened directly at the service's origin, outside the portfolio, is not covered by the one-tab rule.

**When it cannot.** `/start` tells the workspace, which shows the reason with a retry and a link to the case study:

| Cause | What the visitor is told |
| --- | --- |
| No seed, a seed made for another commit, or one that does not match its SHA-256 in `seed.json`; the gateway then serves no seed at all, and only visitors who need one (first visit or Reset) are affected | "The example workspace has not been prepared", "was made for AI Workflow Studio …, but this service runs …", or "does not match its record" |
| The checkout in `AIWS_DIR` is not at `COMMIT`, when it is a Git checkout | "The studio checkout is at …, not the pinned …" |
| The seed cannot be fetched (first visit or Reset) | "The example workspace is not available (status)" |
| The browser refuses the frame storage | "this browser does not let the embedded studio store data…" |
| The browser already holds a newer studio database for this origin | "the studio data already in this browser has a newer format than the example workspace" |
| The session cookie does not come back, so runs could not be followed | "this browser does not keep the studio’s session cookie inside this page…" |

A gateway that cannot serve a valid seed also logs why at startup.

Regenerate the seed whenever `COMMIT` changes; `seed.json` records the commit and the file's SHA-256:

```sh
AIWS_DIR=/path/to/ai-workflow-studio npm run seed:aiws
```

### Corrections for the demo

The pinned example names its sender **James**; for this portfolio it is **Joshua**. `make-seed.mjs` corrects the parsed example before the studio imports it:

- it replaces `\bJames\b` with `Joshua`;
- it expects exactly four replacements: two in the *Draft reply* instructions, one in the enquiry greeting and one in the recorded sign-off, and stops if the source differs.

`seed/seed.json` records the source file's SHA-256, each replacement and where it was made, and the corrected file's SHA-256, so the seed can be reproduced from the pinned commit. The source repository is unchanged.

Still saying "James" outside the demo's control: one recorded reply in the studio's built-in *Lead qualification* starter template (`packages/runtime/src/templates.ts`, part of the studio bundle), and the original AI Workflow Studio capture on the card, overview and case study. Correcting the template needs a change in `JMBorrill/ai-workflow-studio`; the capture needs retaking.

## Restrictions

The studio is unchanged; the gateway decides what its engine may do.

- **Fixture runs only.** The engine starts with an empty environment: no `OPENAI_API_KEY` and no tool secrets. Live runs and resumes are refused. The studio itself disables **Live (OpenAI)** runs of workflows with agents, because the engine reports no key; a live run of a workflow without agents is refused by the gateway.
- **No Python.** Workflows with Python steps or settings are refused on run, resume and export. The Python endpoints are not exposed. The engine's status is passed on with Python marked unavailable, so the studio says so in Settings and the test panel, and the server's interpreter path is not shown.
- **No ZIP import.** Unpacking a visitor's ZIP is refused, with a message the studio shows. Importing a workflow `.json` happens in the browser and works.
- **Session isolation.** A random `aiws_demo` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`) identifies a session. The engine assigns run IDs, and each run is bound to the session that started it. Another session reading, cancelling or deciding it gets 404. The studio's data stays in the visitor's browser.
- **Limits.** JSON bodies only, at most 1 MB. Posts need a session the browser already holds: a request without one is refused rather than given a fresh session, so a client that drops cookies cannot sidestep the per-session limit. 30 posts a minute per session, 60 per client (an IPv4 address or an IPv6 /64; sessions cost nothing to make, so this stops one client taking the whole allowance) and 300 overall. Behind a reverse proxy, set `AIWS_CLIENT_IP_HEADER` to the header the proxy sets with the client's address, such as `x-forwarded-for`; the last address in it is used, the one the proxy saw. Unset, the connection's address is used. 20 executing runs, and 3,000 run starts an hour, 300 of them per client; exports count as runs, because they run the project's fixture test. The engine's schema and wall-clock limits apply too. Ordinary editing makes no engine requests; runs, resumes, exports and template test runs do.
- **Restarts.** Which session owns which run is kept in the gateway's memory. After the gateway restarts, a run that was waiting for approval can no longer be decided (404). Start a new run.

### Studio features that are not available here

| Feature | In the desktop app | Here |
| --- | --- | --- |
| Live runs through the OpenAI Agents SDK | With an API key | Off: the studio disables them, and the gateway refuses them |
| Python steps | Run in a separate interpreter | Off: reported unavailable and refused |
| Tool secrets and API keys | Saved for the engine | None configured; the browser build cannot save them |
| Importing a ZIP export | Unpacked by the engine | Refused; `.json` import works |
| Native file dialogs, the desktop database and engine restarts | Tauri | The browser build's own equivalents: file input, downloads, IndexedDB |

Some of the studio's own wording assumes it runs on your computer, for example "It listens on this computer only" in Settings. The studio is unmodified, so that text stays.

## Origins, cookies and storage

| | Production (proposed) | Local development |
| --- | --- | --- |
| Site | `https://jmborrill.co.uk` (add `https://www.jmborrill.co.uk` to `AIWS_FRAME_ANCESTORS` if it is served there too) | `http://localhost:4173` or `:3000` |
| Studio | `https://studio.jmborrill.co.uk` | `http://localhost:8790` |
| Relationship | Same site: one registrable domain (`.co.uk` is the public suffix) | Same site: ports do not count |

The session cookie is `aiws_demo`, with `Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`. It has no `Domain` attribute, so it belongs to the studio host only. It is sent from inside the frame because the frame is same-site, not because of any third-party allowance, and it needs no `Partitioned` attribute. Under the cookie rules, browsers that block third-party cookies (Safari, Firefox's strict mode, Chrome with blocking on) treat it as first-party; this was verified in Chromium only. The studio's IndexedDB in the frame is keyed to the top-level site. A same-site frame therefore uses the same storage as a visit to the studio directly; a cross-site frame would get separate, partitioned storage.

Two localhost ports prove little about production. `check-origins.mjs` therefore serves the site and studio over HTTPS on production-shaped names: `jmborrill.localhost` and `studio.jmborrill.localhost`, one registrable domain, as with `.co.uk`. It runs Chromium with third-party cookies blocked and repeats the visit from `elsewhere.localhost`, a different site, as a control:

```sh
NEXT_PUBLIC_AIWS_STUDIO_URL=https://studio.jmborrill.localhost:9443 npm run build
AIWS_DIR=/path/to/ai-workflow-studio node demos/aiws/check-origins.mjs
```

It asserts, and exits non-zero on a failure:
- **Same site:** the studio opens, an approved fixture run completes, and the cookie is stored with the attributes above.
- **Cross site:** the workspace explains that the cookie is not kept. The example still loads, into partitioned storage, but without the cookie the studio would wait on its first run indefinitely; `/start` detects this through `/session`.

Only Chromium was available to run this; Safari and Firefox have not been tested.

## Keyboard

The workspace is a modal dialog around the framed studio. When it opens, focus goes to its title, and the dialog's description is the fixture-mode line. The studio does not take focus when it loads.

- Tab goes from the bar into the studio and through the studio's own controls.
- Past the studio's last control, Tab wraps to the bar's first control. Shift+Tab from there goes back into the studio.
- Escape inside the studio belongs to the studio. From the bar, Escape closes the workspace.
- Closing by Close, Escape or browser Back returns focus to the card's **Open the project** button, including when focus was inside the studio.

## Run it locally

You need a checkout of AI Workflow Studio at the pinned commit, built:

```sh
git clone --branch claude/workflow-studio https://github.com/JMBorrill/ai-workflow-studio
cd ai-workflow-studio && git checkout "$(cat /path/to/ai-portfolio/demos/aiws/COMMIT)"
npm ci && npm run build:packages && npm run build -w studio
```

Then, from this repository:

```sh
AIWS_DIR=/path/to/ai-workflow-studio PORT=8790 AIWS_FRAME_ANCESTORS="http://localhost:4173 http://localhost:3000" npm run demo:aiws

# The site, built to frame the service, then served:
NEXT_PUBLIC_AIWS_STUDIO_URL=http://localhost:8790 npm run build && npm run serve   # open http://localhost:4173
# or the development server:
NEXT_PUBLIC_AIWS_STUDIO_URL=http://localhost:8790 npm run dev                      # open http://localhost:3000
```

Use `localhost`, not `127.0.0.1`, for the site, so it is the same site as the service. Open the AI Workflow Studio card and choose **Open the project**, or go straight to `/#ai-workflow-studio/workspace`. If the site was built without `NEXT_PUBLIC_AIWS_STUDIO_URL`, or the service cannot be reached, the workspace says so, offers a retry where it can, and links to the case study.

## In production (not deployed)

The proposed hosting runs this service, the Quant Research Studio service and the static site on one host, behind Caddy, with the service on an internal network that has no route out: [deploy/README.md](../../deploy/README.md). It also has the checks of the built image, through the proxy and in three browsers. Behind the proxy, set `AIWS_CLIENT_IP_HEADER=x-forwarded-for` (see Limits).

On a build network that intercepts TLS, give the build its CA with `BUILD_CA=/path/to/ca.pem demos/aiws/build.sh …`; it is mounted as a build secret and is not part of the image.

## Tests

```sh
AIWS_DIR=/path/to/ai-workflow-studio npm run test:demo        # gateway tests; starts the service itself
NEXT_PUBLIC_AIWS_STUDIO_URL=http://localhost:8790 npm run build
AIWS_DIR=/path/to/ai-workflow-studio npm run e2e              # the portfolio and the real studio inside it
```

For production-shaped origins over HTTPS, see `check-origins.mjs` above.

Without `AIWS_DIR` (or `AIWS_STUDIO=1` with a service already running on port 8790), the browser tests that need the studio are skipped.

## Updating the pin

Change `COMMIT`, rebuild the checkout, regenerate the seed (the gateway refuses a seed for another commit) and run both test suites and `check-origins.mjs`. The service depends on the engine endpoints in `gateway.mjs`, the studio's `/engine` base path and IndexedDB layout (`ai-workflow-studio`, version 1, store `files`, key `studio.sqlite`), and the example at `examples/lead-qualification/`.
