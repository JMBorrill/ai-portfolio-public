# Criteria Chat demo service

The portfolio's **Criteria Chat** workspace is the app itself at the commit in `COMMIT` (`c1613c8`): conversational mortgage-criteria research over three **fictional** lenders, read by its offline keyword reader (no model, no key), behind the shared frame proxy (`demos/lib/frame-proxy.mjs`). Nothing is anonymised because nothing in its corpus is real.

```
CRITERIA_APPROVAL=/path/to/runtime-approval.json demos/criteria/build.sh ~/path/to/criteria-chat   # → demos/criteria/site
PORT=8777 CRITERIA_FRAME_ANCESTORS="http://localhost:3001" node demos/criteria/server.mjs
NEXT_PUBLIC_CRITERIA_SITE_URL=http://localhost:8777 npx next build   # the portfolio, connected
```

- **Approval.** By the app's own design it withholds every policy answer unless `release/runtime-approval.json` approves the dataset's exact digest. Joshua Borrill reviewed the review pack and recorded approval `runtime-050a24d27e85-2026-11-08` with `criteria-chat approve` (8 November 2026). The record lives in his criteria-chat checkout (not committed there) and on the server as `/opt/src/criteria-runtime-approval.json`; `build.sh` copies it in. Any change to the dataset withdraws it.
- **Build.** `build.sh` extracts the pinned commit without `docs/` and the tests, builds the chat UI, and (`SYNC_PYTHON=1`, the default) creates the backend environment after moving the tree into place, because an environment records its own location. The Docker image (`Dockerfile`, context `demos/`) makes its own with uv and Python 3.13.
- **Running.** `server.mjs` starts `criteria-chat serve` on `PORT + 1` and the proxy on `PORT`: `/healthz` (from `/api/status`) and `/start` for the portfolio's frame, and `frame-ancestors` limited to `CRITERIA_FRAME_ANCESTORS`. The app keeps conversations in memory with its own cap on sessions and request size.
