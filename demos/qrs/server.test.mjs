// Adapted from JMBorrill/portfolio at 042649c. Runs against a Quant Research Studio checkout at
// demos/qrs/COMMIT (uv sync --frozen; apps/studio built), starting the service here:
//   QRS_DIR=/path/to/quant-research-studio node --test demos/qrs/server.test.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { after, before, describe, test } from 'node:test';

const QRS_DIR = process.env.QRS_DIR;
if (!QRS_DIR) throw new Error('Set QRS_DIR to a quant-research-studio checkout at demos/qrs/COMMIT, set up (see README.md).');
const python = `${QRS_DIR}/.venv/bin/python`;
const server = new URL('./server.py', import.meta.url).pathname;
const started = [];

// Every test client is 127.0.0.1, so the per-client session cap is raised except where it is tested.
async function startServer(port, env = {}) {
  const child = spawn(python, [server], { env: { ...process.env, PORT: String(port), QRS_FRAME_ANCESTORS: 'http://localhost:4173', QRS_DEMO_SESSIONS_PER_CLIENT: '100', ...env }, stdio: 'inherit' });
  started.push(child);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(`The demo service exited (is port ${port} in use?).`);
    if (await fetch(`${base}/healthz`).then((r) => r.ok, () => false)) return base;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('The demo service did not start.');
}

let base;
before(async () => {
  base = await startServer(8802, { QRS_DEMO_SESSIONS: '40' });
});
after(() => started.forEach((child) => child.kill()));

// QRS's recorded hashes for the EMA crossover on the synthetic dataset from `qrs demo`
// (scripts/check-hashes.py at the pinned commit). Result hashes are compared on Linux x86_64.
const DEMO = { code: 'd8fad9fae5a10cc52f7eb53bb08c45b56aa70118e1f516bc577809468c81d1ec', result: '24357159ece368e027d8249f2065a87ae0725b2bec05353262289125d6239a6c' };

/** A visitor: keeps the session cookie the service issues. */
function visitor(url = base) {
  let cookie = '';
  const request = async (method, path, body, headers = { 'content-type': 'application/json' }) => {
    const res = await fetch(url + path, { method, headers: { ...headers, cookie }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    cookie = res.headers.get('set-cookie')?.split(';')[0] ?? cookie;
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, body: json, text, headers: res.headers };
  };
  /** Opens the workspace as the portfolio's frame does; the ID of the strategy it opens, or the problem. */
  const start = async (query = '', headers = { 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'same-site' }) => {
    const page = await request('GET', `/start${query}`, undefined, headers);
    assert.equal(page.status, 200);
    const problem = JSON.parse(page.text.match(/const problem = (.*);/)[1]);
    return { problem, strategy: page.text.match(/location\.replace\('\/#' \+ "([^"]+)"\)/)?.[1], page };
  };
  return { request, start, cookie: () => cookie };
}

async function runToEnd(v, strategyId, revision) {
  const started = await v.request('POST', `/api/strategies/${strategyId}/runs`, { revision });
  assert.equal(started.status, 200, started.text);
  for (;;) {
    const run = (await v.request('GET', `/api/runs/${started.body.id}`)).body;
    if (!['queued', 'running'].includes(run.status)) return run;
    await new Promise((r) => setTimeout(r, 200));
  }
}

function withPeriod(document, node, period) {
  return { ...document, nodes: document.nodes.map((n) => (n.id === node ? { ...n, params: { ...n.params, period } } : n)) };
}

describe('the workspace', () => {
  test('/start opens a session of its own with the EMA crossover on the synthetic dataset', async () => {
    const v = visitor();
    const { problem, strategy, page } = await v.start();
    assert.equal(problem, null);
    assert.match(page.headers.get('set-cookie'), /^qrs_demo=[\w-]{43}; Path=\/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax$/);
    assert.equal((await v.request('GET', '/session')).body.cookie, true);
    const record = (await v.request('GET', `/api/strategies/${strategy}`)).body;
    assert.equal(record.revision, 1);
    assert.equal(record.document.name, 'EMA crossover');
    const [dataset, ...others] = (await v.request('GET', '/api/datasets')).body;
    assert.equal(others.length, 0);
    assert.equal(dataset.evidence_class, 'synthetic');
    assert.deepEqual((await v.request('GET', '/api/strategies')).body.map((s) => s.id), [strategy]);
  });

  test('opening it again keeps the same session and its edits; Reset starts a new one', async () => {
    const v = visitor();
    const { strategy } = await v.start();
    const record = (await v.request('GET', `/api/strategies/${strategy}`)).body;
    const saved = await v.request('PUT', `/api/strategies/${strategy}`, { revision: 1, document: withPeriod(record.document, 'fast', 12) });
    assert.equal(saved.status, 200, saved.text);
    assert.equal((await v.start()).strategy, strategy);
    assert.equal((await v.request('GET', `/api/strategies/${strategy}`)).body.revision, 2);
    // Another tab saving from the revision it loaded is refused, not applied over the edit.
    const stale = await v.request('PUT', `/api/strategies/${strategy}`, { revision: 1, document: withPeriod(record.document, 'fast', 13) });
    assert.equal(stale.status, 409, stale.text);
    const reset = await v.start('?reset=1');
    assert.notEqual(reset.strategy, strategy);
    assert.equal((await v.request('GET', `/api/strategies/${reset.strategy}`)).body.revision, 1);
    assert.equal((await v.request('GET', `/api/strategies/${strategy}`)).status, 404);
  });

  test('without a session cookie, /session says so and the API refuses to create one', async () => {
    const v = visitor();
    assert.equal((await v.request('GET', '/session')).body.cookie, false);
    for (const [method, path] of [['GET', '/api/strategies'], ['POST', '/api/compile']]) {
      const res = await v.request(method, path, method === 'POST' ? { document: {} } : undefined);
      assert.equal(res.status, 403, `${method} ${path}`);
      assert.match(res.body.detail, /Open the studio from the portfolio/);
      assert.equal(res.headers.get('set-cookie'), null);
    }
    assert.equal((await v.request('GET', '/api/operators')).status, 200); // the studio's first reads need none
  });

  test('/start opens or resets a session only when loaded in a frame by a page on the same site', async () => {
    const v = visitor();
    const { strategy } = await v.start();
    for (const headers of [
      { 'sec-fetch-dest': 'image', 'sec-fetch-site': 'same-site' },
      { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'same-site' },
      { 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'cross-site' },
    ]) {
      const fresh = await visitor().start('', headers);
      assert.equal(fresh.problem, 'Open the studio from the portfolio.', JSON.stringify(headers));
      assert.equal(fresh.page.headers.get('set-cookie'), null);
      assert.equal((await v.start('?reset=1', headers)).problem, 'Open the studio from the portfolio.');
    }
    assert.equal((await v.start()).strategy, strategy); // the refused Resets ended nothing
  });

  test('one client holds a bounded number of sessions, identified by the address the proxy saw', async () => {
    // Clients are told apart by a header here, as behind a reverse proxy; one session each.
    const perClient = await startServer(8807, { QRS_DEMO_SESSIONS_PER_CLIENT: '1', QRS_CLIENT_IP_HEADER: 'x-forwarded-for' });
    const as = (forwarded, url = perClient) => {
      const v = visitor(url);
      const frame = { 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'same-site', 'x-forwarded-for': forwarded };
      return { ...v, start: (query = '') => v.start(query, frame) };
    };
    const tooMany = 'Too many workspaces are open from your network. Try again in a few minutes.';
    // A client's recently used session is not ended for its next one: it may be another person's.
    // The client is the last address, the one the proxy saw; addresses a client puts before it (as
    // a proxy that appends would pass on) change nothing.
    const first = as('192.0.2.10');
    assert.equal((await first.start()).problem, null);
    assert.equal((await as('198.51.100.7, 192.0.2.10').start()).problem, tooMany);
    assert.equal((await first.request('GET', '/session')).body.cookie, true);
    // An IPv6 client is its /64.
    assert.equal((await as('2001:db8:5:6::1').start()).problem, null);
    assert.equal((await as('2001:db8:5:6::2').start()).problem, tooMany);
    // Another client is unaffected. New sessions are also limited per client per minute (2 here):
    // a Reset beyond that is refused, and the session it would have replaced carries on.
    const b = as('192.0.2.20');
    assert.equal((await b.start()).problem, null);
    const reset = await b.start('?reset=1');
    assert.equal(reset.problem, null);
    assert.equal((await b.start('?reset=1')).problem, 'Too many workspaces have been opened from your network. Try again in a minute.');
    assert.equal((await b.start()).strategy, reset.strategy);
  });

  test("one client's refused requests do not use up what other visitors share", async () => {
    // New workspaces: 30 a minute for everyone here. One address asks 40 times: one opens, the
    // rest are refused by its own limits, and they count against nothing shared.
    const perClient = await startServer(8809, { QRS_DEMO_SESSIONS_PER_CLIENT: '1', QRS_CLIENT_IP_HEADER: 'x-forwarded-for' });
    const as = (forwarded) => {
      const v = visitor(perClient);
      const frame = { 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'same-site', 'x-forwarded-for': forwarded };
      return { ...v, start: (query = '') => v.start(query, frame) };
    };
    const problems = [];
    for (let i = 0; i < 40; i++) problems.push((await as('192.0.2.60').start()).problem);
    assert.equal(problems.filter((p) => p === null).length, 1, problems.join());
    assert.equal((await as('192.0.2.61').start()).problem, null);
    // Writes: 300 a minute for everyone. One workspace sends 330: 30 pass, and its 300 refusals do
    // not stop another workspace's first write.
    const greedy = as('192.0.2.62');
    await greedy.start();
    const statuses = [];
    for (let i = 0; i < 330; i++) statuses.push((await greedy.request('POST', '/api/compile', { document: {} })).status);
    assert.equal(statuses.filter((s) => s !== 429).length, 30);
    const other = as('192.0.2.63');
    await other.start();
    assert.notEqual((await other.request('POST', '/api/compile', { document: {} })).status, 429);
  });

  test('a session ends after its lifetime however active it is, once no run is in progress', async () => {
    const short = await startServer(8810, { QRS_DEMO_LIFETIME_SECONDS: '2' });
    const v = visitor(short);
    await v.start();
    for (let i = 0; i < 4; i++) {
      await v.request('GET', '/api/strategies'); // active all along
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.equal((await v.request('GET', '/session')).body.cookie, false);
  });

  test("a client's session idle long enough makes way for its next, unless it is running a backtest", async () => {
    const perClient = await startServer(8808, { QRS_DEMO_SESSIONS_PER_CLIENT: '1', QRS_CLIENT_IP_HEADER: 'x-forwarded-for', QRS_DEMO_RECLAIM_SECONDS: '0' });
    const as = (forwarded) => {
      const v = visitor(perClient);
      const frame = { 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'same-site', 'x-forwarded-for': forwarded };
      return { ...v, start: (query = '') => v.start(query, frame) };
    };
    const busy = as('192.0.2.30');
    const { strategy } = await busy.start();
    assert.equal((await busy.request('POST', `/api/strategies/${strategy}/runs`, { revision: 1 })).status, 200);
    assert.equal((await as('192.0.2.30').start()).problem, 'Too many workspaces are open from your network. Try again in a few minutes.');
    assert.equal((await busy.request('GET', '/session')).body.cookie, true);
    const idle = as('192.0.2.40');
    assert.equal((await idle.start()).problem, null);
    assert.equal((await as('192.0.2.40').start()).problem, null);
    assert.equal((await idle.request('GET', '/session')).body.cookie, false);
  });

  test('only the configured portfolio origin may frame the studio', async () => {
    for (const path of ['/', '/start', '/api/operators', '/healthz']) {
      const res = await fetch(base + path);
      assert.equal(res.headers.get('x-frame-options'), null, path);
      assert.equal(res.headers.get('content-security-policy'), 'frame-ancestors http://localhost:4173', path);
    }
  });

  test('only the health check is readable from other origins', async () => {
    assert.equal((await fetch(`${base}/healthz`)).headers.get('access-control-allow-origin'), '*');
    for (const path of ['/start', '/session', '/api/operators']) assert.equal((await fetch(base + path)).headers.get('access-control-allow-origin'), null, path);
  });

  test("/start's script is valid JavaScript", async () => {
    const { Script } = await import('node:vm');
    const { page } = await visitor().start();
    assert.doesNotThrow(() => new Script(page.text.match(/<script>([\s\S]*)<\/script>/)[1]));
  });
});

describe('the research engine', () => {
  test('a real backtest of the preloaded strategy reproduces QRS’s recorded code and result hashes', async () => {
    const v = visitor();
    const { strategy } = await v.start();
    const run = await runToEnd(v, strategy, 1);
    assert.equal(run.status, 'succeeded', run.error);
    assert.equal(run.code_sha256, DEMO.code);
    assert.equal(run.result_sha256, DEMO.result);
    const result = await v.request('GET', `/api/runs/${run.id}/result`);
    assert.equal(result.status, 200);
    assert.equal(result.body.evidence_class, 'synthetic');
    const log = await v.request('GET', `/api/runs/${run.id}/log`);
    assert.equal(log.status, 200);
    assert.ok(log.text.length > 0);
  });

  test('an edited strategy is saved as a new revision and runs as different code', async () => {
    const v = visitor();
    const { strategy } = await v.start();
    const record = (await v.request('GET', `/api/strategies/${strategy}`)).body;
    const document = withPeriod(record.document, 'fast', 15);
    assert.equal((await v.request('POST', '/api/compile', { document })).status, 200);
    const saved = await v.request('PUT', `/api/strategies/${strategy}`, { revision: 1, document });
    assert.equal(saved.body.revision, 2);
    const run = await runToEnd(v, strategy, 2);
    assert.equal(run.status, 'succeeded', run.error);
    assert.notEqual(run.code_sha256, DEMO.code);
  });

  test('export downloads a standalone bundle of the strategy', async () => {
    const v = visitor();
    const { strategy } = await v.start();
    const res = await fetch(`${base}/api/strategies/${strategy}/export?revision=1`, { headers: { cookie: v.cookie() } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), new RegExp(`attachment; filename="strategy-${strategy}-r1\\.zip"`));
    assert.equal(Buffer.from(await res.arrayBuffer()).subarray(0, 2).toString(), 'PK');
  });
});

describe('isolation', () => {
  test("a visitor cannot see or change another visitor's strategy or runs", async () => {
    const alice = visitor();
    const { strategy } = await alice.start();
    const run = await runToEnd(alice, strategy, 1);
    const bob = visitor();
    await bob.start();
    assert.equal((await bob.request('GET', `/api/strategies/${strategy}`)).status, 404);
    assert.equal((await bob.request('PUT', `/api/strategies/${strategy}`, { revision: 1, document: {} })).status >= 400, true);
    assert.equal((await bob.request('GET', `/api/runs/${run.id}`)).status, 404);
    assert.equal((await bob.request('GET', `/api/runs/${run.id}/result`)).status, 404);
    assert.equal((await bob.request('POST', `/api/strategies/${strategy}/runs`, { revision: 1 })).status, 404);
    assert.equal((await bob.request('GET', `/api/strategies/${strategy}/export?revision=1`)).status, 404);
    assert.ok(!(await bob.request('GET', '/api/runs')).body.some((r) => r.id === run.id));
  });
});

describe('only the demonstrated journey', () => {
  test('everything else is refused, including import, new strategies and the research areas', async () => {
    const v = visitor();
    const { strategy } = await v.start();
    const refused = [
      ['POST', '/api/strategies'],
      ['POST', '/api/datasets/import'],
      ['POST', '/api/runs/abc/rerun'],
      ['POST', '/api/compare'],
      ['GET', '/api/experiments'],
      ['POST', '/api/experiments'],
      ['GET', '/api/methods'],
      ['GET', '/api/analyses'],
      ['POST', '/api/analyses'],
      ['GET', '/api/projects'],
      ['POST', '/api/projects'],
      ['POST', '/api/families'],
      ['GET', '/api/reports'],
      ['POST', '/api/reports'],
      ['DELETE', `/api/strategies/${strategy}`],
      ['GET', '/docs'],
      ['GET', '/openapi.json'],
    ];
    for (const [method, path] of refused) {
      const res = await v.request(method, path, method === 'GET' || method === 'DELETE' ? undefined : {});
      assert.equal(res.status, 404, `${method} ${path}`);
    }
  });

  test('posts must be JSON and at most 1 MB; a session is limited to 30 writes a minute', async () => {
    const v = visitor();
    const { strategy } = await v.start();
    assert.equal((await v.request('POST', '/api/compile', 'x', { 'content-type': 'text/plain' })).status, 415);
    assert.equal((await v.request('POST', '/api/compile', { pad: 'x'.repeat(1_100_000) })).status, 413);
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await v.request('POST', '/api/compile', { nodes: [], edges: [] })).status);
    assert.ok(statuses.slice(0, 29).every((s) => s !== 429), statuses.join());
    assert.equal(statuses[30], 429);
    // Export builds a bundle, so it counts as a write too.
    assert.equal((await v.request('GET', `/api/strategies/${strategy}/export?revision=1`)).status, 429);
  });

  test('runs per session are bounded', async () => {
    const limited = await startServer(8804, { QRS_DEMO_RUNS_PER_SESSION: '1' });
    const v = visitor(limited);
    const { strategy } = await v.start();
    assert.equal((await runToEnd(v, strategy, 1)).status, 'succeeded');
    const second = await v.request('POST', `/api/strategies/${strategy}/runs`, { revision: 1 });
    assert.equal(second.status, 429);
    assert.match(second.body.detail, /run its 1 backtests/);
  });

  test('a backtest over the time limit is stopped by QRS', async () => {
    const limited = await startServer(8806, { QRS_DEMO_RUN_SECONDS: '0.05' });
    const v = visitor(limited);
    const { strategy } = await v.start();
    const run = await runToEnd(v, strategy, 1);
    assert.equal(run.status, 'failed');
    assert.match(run.error, /time limit/);
  });

  test('storage per session is bounded', async () => {
    // A session's store alone is larger than this, so its first save is over the limit.
    const limited = await startServer(8805, { QRS_DEMO_SESSION_BYTES: '1' });
    const v = visitor(limited);
    const { strategy } = await v.start();
    const record = (await v.request('GET', `/api/strategies/${strategy}`)).body;
    const saved = await v.request('PUT', `/api/strategies/${strategy}`, { revision: 1, document: withPeriod(record.document, 'fast', 11) });
    assert.equal(saved.status, 507, saved.text);
    assert.match(saved.body.detail, /storage limit/);
    assert.equal((await v.request('GET', `/api/strategies/${strategy}`)).body.revision, 1);
    assert.equal((await v.request('GET', `/api/strategies/${strategy}/export?revision=1`)).status, 507);
  });

  test('when every session is in use, /start says the demo is busy', async () => {
    const one = await startServer(8803, { QRS_DEMO_SESSIONS: '1' });
    assert.equal((await visitor(one).start()).problem, null);
    const { problem, strategy } = await visitor(one).start();
    assert.equal(problem, 'The demo is busy. Try again in a minute.');
    assert.equal(strategy, undefined);
  });
});

describe('no model providers', () => {
  test('the service and its worker load no provider adapter or network client', () => {
    // Importing the service builds the shared dataset and the apps, as at startup.
    const loaded = execFileSync(
      python,
      [
        '-c',
        [
          'import os, runpy, sys, tempfile',
          'os.environ["QRS_DEMO_HOME"] = tempfile.mkdtemp()',
          `runpy.run_path(${JSON.stringify(server)}, run_name="checked")`,
          'import qrs.worker, qrs.simulation, qrs.export',
          'bad = sorted(m for m in sys.modules if m.startswith("qrs.providers.") or m.split(".")[0] in ("anthropic", "ollama", "openai", "httpx", "requests", "aiohttp"))',
          'print(",".join(bad))',
        ].join('\n'),
      ],
      { encoding: 'utf8' },
    ).trim();
    assert.equal(loaded, '');
  });

  test('only the CLI can reach a provider: every call that can ask one, found in the source', () => {
    // A provider is asked only through providers.adapter(), which only extraction.record_missing()
    // calls, which only extract() calls, when given record=True. List every call of the three.
    const calls = execFileSync(
      python,
      [
        '-c',
        [
          'import ast, pathlib, sys',
          'root = pathlib.Path(sys.argv[1])',
          'for path in sorted(root.rglob("*.py")):',
          '    tree = ast.parse(path.read_text())',
          '    for fn in [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]:',
          '        for call in [n for n in ast.walk(fn) if isinstance(n, ast.Call)]:',
          '            name = getattr(call.func, "attr", getattr(call.func, "id", None))',
          '            if name in ("adapter", "record_missing", "extract"):',
          '                record = next((ast.unparse(k.value) for k in call.keywords if k.arg == "record"), "-")',
          '                print(f"{path.relative_to(root)} {fn.name} {name} record={record}")',
        ].join('\n'),
        `${QRS_DIR}/src/qrs`,
      ],
      { encoding: 'utf8' },
    );
    assert.deepEqual(calls.trim().split('\n').sort(), [
      'cli.py extract_features extract record=args.record', // `qrs extract --record`
      'extraction.py extract record_missing record=-', // inside `if record:`
      'extraction.py record_missing adapter record=-',
      'templates.py prepare_features extract record=-', // replays recorded responses
    ]);
  });

  test('a journey through the service never asks a provider or opens an outbound connection', () => {
    // In the service's process: the provider entry points raise, and every socket connection is
    // recorded. (Backtests run in QRS's worker processes; check-network.sh traces those.)
    const report = execFileSync(
      python,
      [
        '-c',
        [
          'import json, os, re, runpy, socket, sys, tempfile, time',
          'from qrs import extraction, providers',
          'def tripwire(*args, **kwargs): raise AssertionError("a provider was asked")',
          'providers.adapter = extraction.record_missing = tripwire',
          'connections = []',
          'real_connect = socket.socket.connect',
          'def connect(self, address):',
          '    connections.append(repr(address))',
          '    return real_connect(self, address)',
          'socket.socket.connect = connect',
          'os.environ["QRS_DEMO_HOME"] = tempfile.mkdtemp()',
          `service = runpy.run_path(${JSON.stringify(server)}, run_name="checked")`,
          'from starlette.testclient import TestClient',
          'with TestClient(service["app"], base_url="https://testserver") as client:',  // Secure cookie kept over https
          '    for path in ("/api/operators", "/api/templates", "/api/datasets"): assert client.get(path).status_code == 200, path',
          '    page = client.get("/start", headers={"sec-fetch-dest": "iframe", "sec-fetch-site": "same-site"}).text',
          '    sid = re.search(r"location\\.replace\\(\'/#\' \\+ \\"([^\\"]+)\\"\\)", page).group(1)',
          '    document = client.get(f"/api/strategies/{sid}").json()["document"]',
          '    assert client.post("/api/compile", json={"document": document}).status_code == 200',
          '    revision = client.put(f"/api/strategies/{sid}", json={"revision": 1, "document": document}).json()["revision"]',
          '    run = client.post(f"/api/strategies/{sid}/runs", json={"revision": revision}).json()',
          '    while (run := client.get(f"/api/runs/{run[\'id\']}").json())["status"] in ("queued", "running"): time.sleep(0.2)',
          '    assert run["status"] == "succeeded", run',
          '    for path in (f"/api/runs/{run[\'id\']}/result", f"/api/runs/{run[\'id\']}/log", "/api/runs", "/api/strategies", f"/api/strategies/{sid}/export?revision={revision}"):',
          '        assert client.get(path).status_code == 200, path',
          '    second = client.post(f"/api/strategies/{sid}/runs", json={"revision": revision}).json()',
          '    # As the studio does: every request it makes says JSON, a body or not.',
          '    cancelled = client.post(f"/api/runs/{second[\'id\']}/cancel", headers={"content-type": "application/json"})',
          '    assert cancelled.status_code == 200, cancelled.text',
          'journey = list(connections)',
          '# Control: the recording sees a connection when one is attempted (192.0.2.1 is a documentation address).',
          'probe = socket.socket(); probe.settimeout(0.2)',
          'try: probe.connect(("192.0.2.1", 9))',
          'except OSError: pass',
          'assert connections[len(journey):] == [repr(("192.0.2.1", 9))], connections',
          'print(json.dumps(journey))',
        ].join('\n'),
      ],
      { encoding: 'utf8' },
    );
    assert.deepEqual(JSON.parse(report.trim().split('\n').at(-1)), []);
  });
});
