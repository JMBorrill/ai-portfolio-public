# jmborrill.co.uk

Joshua Borrill’s technical portfolio. **Deployed at [jmborrill.co.uk](https://jmborrill.co.uk) behind a password, with both flagship cards opening into the real applications.**

Two flagship Living Projects lead the experience: AI Workflow Studio and Quant Research Studio. Supporting work demonstrates engineering, AI systems, product judgement and commercial delivery.

## Find the right reference

| Need | Authoritative location |
| --- | --- |
| Engineering principles and autonomy | [CLAUDE.md](CLAUDE.md) |
| Project card data and conservative status labels | [content/projects.json](content/projects.json) |
| AI Workflow Studio demo service: example workspace, restrictions, local run | [demos/aiws/README.md](demos/aiws/README.md) |
| Quant Research Studio demo service: sessions, allowed journey, limits, no providers | [demos/qrs/README.md](demos/qrs/README.md) |
| Criteria Chat demo service: approval, build, serving | [demos/criteria/README.md](demos/criteria/README.md) |
| Satellite Intelligence Lab viewer: images, figures, why not the lab's own results | [demos/satellite/README.md](demos/satellite/README.md) |
| The live deployment: the existing VPS behind its shared Caddy, all demo services | [deploy/vps/README.md](deploy/vps/README.md) |
| Original hosting proposal: Caddy and both demo services on their own host, limits, cost | [deploy/README.md](deploy/README.md) |

This public edition omits the internal build references (`references/`) and the two client demo pipelines, because they contain private research notes and the real client details that the demos anonymise.

## Site

A Next.js static export (`app/`, `components/`, `lib/`, `public/projects/`) with the homepage and the two flagship case studies. Project cards read `content/projects.json`; reviewed capture derivatives and their alt text and captions are in `content/media.ts`. There is no CMS or analytics.

Each flagship card opens in place: card → preview → full-window workspace (`/#ai-workflow-studio/workspace`, `/#quant-research-studio/workspace`). Each workspace frames the real application, served by its demo service:
- `demos/aiws/`: AI Workflow Studio with its fixture-only engine;
- `demos/qrs/`: Quant Research Studio with its research engine, per visitor, on synthetic data;
- the charity website and the schools league platform: anonymised client demos, whose build pipelines are withheld from this public edition;
- `demos/criteria/`: Criteria Chat on its fictional, reviewer-approved dataset.

The site is built with `NEXT_PUBLIC_AIWS_STUDIO_URL`, `NEXT_PUBLIC_QRS_STUDIO_URL`, `NEXT_PUBLIC_CHARITY_SITE_URL`, `NEXT_PUBLIC_FOOTBALL_SITE_URL` and `NEXT_PUBLIC_CRITERIA_SITE_URL` pointing at them. Without them, the workspace says the application is not connected, and the case studies are unaffected. The deployment and the checks of the built images behind Caddy are in `deploy/`.

Requires Node 22 or later.

```sh
npm ci                  # clean install
npm run dev             # development server
npm run build           # static export to out/ (set NEXT_PUBLIC_AIWS_STUDIO_URL to connect the studio)
npm run serve           # serve out/ at http://localhost:4173
npm run check           # typecheck, build, then check links, anchors, images and evidence leakage in out/
npm run demo:aiws       # the AI Workflow Studio demo service; needs AIWS_DIR (see demos/aiws/README.md)
npm run seed:aiws       # regenerate its example workspace with the real studio; needs AIWS_DIR
npm run test:demo       # AI Workflow Studio service tests; needs AIWS_DIR
npm run demo:qrs        # the Quant Research Studio demo service; needs QRS_DIR (see demos/qrs/README.md)
npm run test:qrs        # Quant Research Studio service tests; needs QRS_DIR
npm run check:qrs-network  # no-network and strace check of the QRS journey; needs QRS_DIR, root, strace
npm run e2e             # browser tests against out/; application tests need AIWS_DIR, QRS_DIR and CRITERIA_SITE
```

Running the studio locally, step by step: [demos/aiws/README.md](demos/aiws/README.md#run-it-locally).

## Licence

Copyright © 2026 Joshua Borrill. All rights reserved.

This is publicly inspectable proprietary source code, not open source. No permission is granted to use, copy, modify, distribute, sublicense, sell or otherwise exploit it without Joshua Borrill's prior written permission, except as GitHub's Terms of Service require for public repositories. See [LICENSE](LICENSE). Third-party dependencies and data remain under their own licences and attribution terms.

## About this public release

This repository is a fresh public snapshot of private development at source revision `f29e7c9` (2026-11-09). Commit hashes, branch names and pull-request numbers cited in the documentation refer to that private history and are not available here.
