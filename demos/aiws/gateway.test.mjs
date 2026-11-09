// Adapted from JMBorrill/portfolio at 042649c. Runs against a built AI Workflow Studio checkout, starting the gateway here:
//   AIWS_DIR=/path/to/ai-workflow-studio node --test demos/aiws/gateway.test.mjs
// or against a running demo service, such as the container:
//   AIWS_DIR=… AIWS_DEMO_URL=http://host:8080 node --test demos/aiws/gateway.test.mjs  (example data is read from AIWS_DIR)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Script } from 'node:vm';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

const port = 8701;
const base = process.env.AIWS_DEMO_URL ?? `http://127.0.0.1:${port}`;
let gateway;

before(async () => {
  if (process.env.AIWS_DEMO_URL) return;
  gateway = spawn(process.execPath, [new URL('./gateway.mjs', import.meta.url).pathname], { env: { ...process.env, PORT: String(port), AIWS_FRAME_ANCESTORS: 'http://localhost:4173', AIWS_CLIENT_IP_HEADER: 'x-forwarded-for', AIWS_DEMO_RUNS_PER_CLIENT: '30' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve) => gateway.stdout.on('data', (d) => String(d).includes('gateway on') && resolve()));
});
after(() => gateway?.kill());

// Each visitor has an address of its own unless given one, as the proxy would report it.
let visitors = 0;
/** A visitor: keeps the session cookie the gateway issues. */
function visitor(address = `10.0.${Math.floor(++visitors / 250)}.${visitors % 250}`) {
  let cookie = '';
  const request = async (method, path, body, headers = { 'content-type': 'application/json' }) => {
    // As the studio does, get a session before posting: the gateway refuses posts without one.
    if (!cookie && method === 'POST' && path.startsWith('/engine/')) await request('GET', '/engine/health');
    const res = await fetch(base + path, { method, headers: { 'x-forwarded-for': address, ...headers, cookie }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    cookie = res.headers.get('set-cookie')?.split(';')[0] ?? cookie;
    return { status: res.status, body: await res.json() };
  };
  const poll = async (runId) => {
    for (;;) {
      const res = await request('GET', `/engine/runs/${runId}`);
      if (res.body.status !== 'running') return res.body;
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  return { request, poll };
}

// The lead-qualification example and its 8 scripted scenarios, read from the pinned checkout.
const exampleDir = `${process.env.AIWS_DIR}/examples/lead-qualification`;
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const example = async () => {
  const enquiries = readJson(`${exampleDir}/enquiries.json`);
  return {
    workflow: readJson(`${exampleDir}/workflow.json`),
    // The scenarios with recorded answers (a case file each), in the order the example lists them.
    scenarios: readdirSync(`${exampleDir}/cases`)
      .map((file) => file.replace(/\.json$/, ''))
      .map((id) => ({ id, ...enquiries.find((e) => e.id === id), fixtures: readJson(`${exampleDir}/cases/${id}.json`) }))
      .sort((a, b) => enquiries.findIndex((e) => e.id === a.id) - enquiries.findIndex((e) => e.id === b.id)),
  };
};

async function startScenario(v, workflow, scenario) {
  const res = await v.request('POST', '/engine/runs', { workflow: { ...workflow, fixtures: scenario.fixtures }, input: scenario.fixtures.input, mode: 'fixture', approvals: 'pause' });
  assert.equal(res.status, 202, JSON.stringify(res.body));
  return { runId: res.body.runId, poll: await v.poll(res.body.runId) };
}

describe('scenarios', () => {
  test('the example has the eight scripted scenarios', async () => {
    const { workflow, scenarios } = await example();
    assert.equal(workflow.id, 'wf_jmb_lead_qualification');
    assert.equal(scenarios.length, 8);
    for (const s of scenarios) assert.ok(s.about && s.expect && s.fixtures.input, s.id);
  });

  test('every scenario runs through the real runtime and ends in an expected outcome, approved and rejected', async () => {
    const { workflow, scenarios } = await example();
    const v = visitor();
    for (const scenario of scenarios) {
      const { poll } = await startScenario(v, workflow, scenario);
      assert.equal(poll.result.mode, 'fixture', scenario.id);
      if (poll.status === 'completed') {
        assert.ok(scenario.expect.outcomes.includes(poll.result.outcome), `${scenario.id}: ${poll.result.outcome}`);
        continue;
      }
      assert.equal(poll.status, 'waiting_approval', scenario.id);
      assert.equal(poll.result.checkpoint.request.nodeId, 'review');
      for (const [approved, outcome] of [[true, 'queued'], [false, 'rejected']]) {
        const { runId, poll: paused } = await startScenario(v, workflow, scenario);
        const resumed = await v.request('POST', '/engine/resume', { workflow: { ...workflow, fixtures: scenario.fixtures }, checkpoint: paused.result.checkpoint, decision: { approved, comment: 'test' } });
        assert.equal(resumed.status, 202, JSON.stringify(resumed.body));
        const done = await v.poll(runId);
        assert.equal(done.status, 'completed', `${scenario.id}: ${done.error}`);
        assert.equal(done.result.outcome, outcome, scenario.id);
      }
    }
  });

  test('an approval can be decided only once', async () => {
    const { workflow, scenarios } = await example();
    const v = visitor();
    const { runId, poll } = await startScenario(v, workflow, scenarios[0]);
    const body = { workflow: { ...workflow, fixtures: scenarios[0].fixtures }, checkpoint: poll.result.checkpoint, decision: { approved: true } };
    assert.equal((await v.request('POST', '/engine/resume', body)).status, 202);
    await v.poll(runId);
    assert.equal((await v.request('POST', '/engine/resume', body)).status, 409);
  });

  test('export produces a project ZIP whose own fixture run completes', async () => {
    const { workflow } = await example();
    const res = await visitor().request('POST', '/engine/export', { workflow });
    assert.equal(res.status, 200);
    assert.equal(res.body.fixtureRun.status, 'completed');
    const paths = res.body.files.map((f) => f.path);
    for (const p of ['package.json', 'workflow/workflow.json', 'Dockerfile', 'README.md']) assert.ok(paths.includes(p), p);
    assert.equal(Buffer.from(res.body.zipBase64, 'base64').subarray(0, 2).toString(), 'PK');
  });
});

describe('isolation', () => {
  test("a visitor cannot read, cancel or decide another visitor's run", async () => {
    const { workflow, scenarios } = await example();
    const alice = visitor();
    const bob = visitor();
    const { runId, poll } = await startScenario(alice, workflow, scenarios[0]);
    await bob.request('GET', '/engine/health'); // bob gets his own session
    assert.equal((await bob.request('GET', `/engine/runs/${runId}`)).status, 404);
    assert.equal((await bob.request('POST', `/engine/runs/${runId}/cancel`, {})).status, 404);
    const decision = { workflow: { ...workflow, fixtures: scenarios[0].fixtures }, checkpoint: poll.result.checkpoint, decision: { approved: true } };
    assert.equal((await bob.request('POST', '/engine/resume', decision)).status, 404);
    assert.equal((await alice.request('GET', `/engine/runs/${runId}`)).body.status, 'waiting_approval');
  });

  test('a visitor without a session sees nothing', async () => {
    const { workflow, scenarios } = await example();
    const { runId } = await startScenario(visitor(), workflow, scenarios[2]);
    const res = await fetch(`${base}/engine/runs/${runId}`);
    assert.equal(res.status, 404);
  });

  test('the engine assigns run IDs; a chosen one is ignored', async () => {
    const { workflow, scenarios } = await example();
    const v = visitor();
    const res = await v.request('POST', '/engine/runs', { workflow: { ...workflow, fixtures: scenarios[2].fixtures }, input: scenarios[2].fixtures.input, mode: 'fixture', runId: 'run_chosenbyvisitor' });
    assert.equal(res.status, 202);
    assert.notEqual(res.body.runId, 'run_chosenbyvisitor');
  });
});

describe('safety', () => {
  test('posts without a session are refused, so per-session limits cannot be sidestepped', async () => {
    const { workflow, scenarios } = await example();
    const body = JSON.stringify({ workflow: { ...workflow, fixtures: scenarios[0].fixtures }, input: scenarios[0].fixtures.input, mode: 'fixture' });
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${base}/engine/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      assert.equal(res.status, 403);
      assert.match((await res.json()).error, /No session/);
    }
  });

  test('the raw example is not served', async () => {
    assert.equal((await fetch(`${base}/example`)).status, 404);
  });

  test('live mode is refused, for runs and resumes', async () => {
    const { workflow, scenarios } = await example();
    const v = visitor();
    assert.equal((await v.request('POST', '/engine/runs', { workflow, input: {}, mode: 'live' })).status, 403);
    const { poll } = await startScenario(v, workflow, scenarios[0]);
    const checkpoint = { ...poll.result.checkpoint, mode: 'live' };
    assert.equal((await v.request('POST', '/engine/resume', { workflow, checkpoint, decision: { approved: true } })).status, 403);
  });

  test('the engine holds no credentials, and the studio is told Python steps are off', async () => {
    const { body } = await visitor().request('GET', '/engine/health');
    assert.equal(body.openaiKey, false);
    assert.deepEqual(body.secrets, []);
    assert.deepEqual(body.python, { ok: false, error: 'Python steps are switched off in this public demo.' });
  });

  test('workflows with Python steps are refused wherever the engine would run them', async () => {
    const { workflow, scenarios } = await example();
    const v = visitor();
    const python = {
      ...workflow,
      schemaVersion: 2,
      nodes: [...workflow.nodes, { id: 'calc', type: 'python', label: 'Calculate', position: { x: 0, y: 0 }, config: { code: 'def run(inputs):\n    return {}', inputs: {}, outputs: [] } }],
    };
    const run = await v.request('POST', '/engine/runs', { workflow: python, input: scenarios[0].fixtures.input, mode: 'fixture' });
    assert.equal(run.status, 403);
    assert.match(run.body.error, /Python/);
    assert.equal((await v.request('POST', '/engine/export', { workflow: python })).status, 403);
    assert.equal((await v.request('POST', '/engine/export', { workflow: { ...workflow, python: { modules: [] } } })).status, 403);
    const { poll } = await startScenario(v, workflow, scenarios[0]);
    assert.equal((await v.request('POST', '/engine/resume', { workflow: python, checkpoint: poll.result.checkpoint, decision: { approved: true } })).status, 403);
    for (const path of ['/engine/python/check', '/engine/python/prepare', '/engine/python/test']) assert.equal((await v.request('POST', path, { workflow: python })).status, 404, path);
  });

  test('only allowlisted endpoints are reachable', async () => {
    const v = visitor();
    const zip = await v.request('POST', '/engine/import', { base64: 'UEsFBg==' });
    assert.equal(zip.status, 403);
    assert.match(zip.body.error, /ZIP exports is switched off/);
    assert.equal((await v.request('DELETE', '/engine/runs/run_abcdef')).status, 404);
    assert.equal((await v.request('GET', '/engine/../health')).status, 404);
  });

  test('posts must be JSON and at most 1 MB', async () => {
    const v = visitor();
    assert.equal((await v.request('POST', '/engine/validate', 'workflow=x', { 'content-type': 'application/x-www-form-urlencoded' })).status, 415);
    assert.equal((await v.request('POST', '/engine/validate', { workflow: 'x'.repeat(1_100_000) })).status, 413);
    assert.equal((await v.request('POST', '/engine/validate', '[1]')).status, 400);
  });

  test('a session is limited to 30 posts a minute', async () => {
    const v = visitor();
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await v.request('POST', '/engine/validate', { workflow: {} })).status);
    assert.ok(statuses.slice(0, 30).every((s) => s !== 429));
    assert.equal(statuses[30], 429);
  });

  test('a client is limited to 60 posts a minute across its sessions, identified by the address the proxy saw', async () => {
    // Sessions are free to make, so each of these holds under its own limit of 30.
    const post = (v) => v.request('POST', '/engine/validate', { workflow: {} }).then((r) => r.status);
    const sessions = [visitor('192.0.2.50'), visitor('192.0.2.50'), visitor('198.51.100.9, 192.0.2.50')];
    const statuses = [];
    for (const v of sessions) for (let i = 0; i < 20; i++) statuses.push(await post(v));
    assert.ok(statuses.every((s) => s !== 429), statuses.join());
    // An address put before the proxy's own changes nothing; an IPv6 client is its /64.
    assert.equal(await post(visitor('203.0.113.1, 192.0.2.50')), 429);
    const ipv6 = [visitor('2001:db8:7:8::1'), visitor('2001:db8:7:8::2'), visitor('2001:db8:7:8:ffff::3')];
    for (const v of ipv6) for (let i = 0; i < 20; i++) await post(v);
    assert.equal(await post(visitor('2001:db8:7:8::9')), 429);
    assert.notEqual(await post(visitor('192.0.2.51')), 429);
  });

  test('a client is limited in run starts an hour (30 here), and refused starts count against nothing', async () => {
    const { workflow, scenarios } = await example();
    const start = (v) => v.request('POST', '/engine/runs', { workflow: { ...workflow, fixtures: scenarios[0].fixtures }, input: scenarios[0].fixtures.input, mode: 'fixture', approvals: 'pause' }).then((r) => r.status);
    const statuses = [];
    // Each from a new session: sessions are free, so the per-session post limit would not stop it.
    for (let i = 0; i < 32; i++) statuses.push(await start(visitor('192.0.2.70')));
    assert.deepEqual(statuses, [...Array(30).fill(202), 503, 503]);
    assert.equal(await start(visitor('192.0.2.71')), 202);
  });

  test('the studio is served, without source maps or paths outside it', async () => {
    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /<div id="root">/);
    const asset = (await (await fetch(`${base}/`)).text()).match(/\/assets\/[^"]+\.js/)[0];
    assert.equal((await fetch(base + asset)).status, 200);
    assert.equal((await fetch(`${base + asset}.map`)).status, 404);
    assert.equal((await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`)).status, 404);
  });

  test('only the health check is readable from other origins', async () => {
    assert.equal((await fetch(`${base}/healthz`)).headers.get('access-control-allow-origin'), '*');
    for (const path of ['/start', '/session', '/engine/health']) assert.equal((await fetch(base + path)).headers.get('access-control-allow-origin'), null, path);
  });

  test('only the configured portfolio origins may frame the studio', async () => {
    for (const path of ['/', '/start', '/engine/health']) {
      const res = await fetch(base + path);
      assert.equal(res.headers.get('x-frame-options'), null, path);
      assert.match(res.headers.get('content-security-policy') ?? '', /^frame-ancestors /, path);
    }
    if (!process.env.AIWS_DEMO_URL) assert.equal((await fetch(base + '/')).headers.get('content-security-policy'), 'frame-ancestors http://localhost:4173');
  });
});

describe('the example workspace', () => {
  test('/session reports whether the session cookie came back', async () => {
    const v = visitor();
    assert.equal((await v.request('GET', '/session')).body.cookie, false);
    await v.request('GET', '/engine/health'); // issues the cookie
    assert.equal((await v.request('GET', '/session')).body.cookie, true);
  });

  test("/start's script is valid JavaScript", async () => {
    const html = await (await fetch(`${base}/start`)).text();
    const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
    assert.doesNotThrow(() => new Script(script));
  });

  test('/start restores the snapshot the studio made, then opens the example workflow', async () => {
    const page = await fetch(`${base}/start`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    const html = await page.text();
    assert.match(html, /location\.replace\('\/' \+ "#\/workflows\/wf_jmb_lead_qualification\/test"\)/);
    const seed = await fetch(`${base}/seed/studio.sqlite`);
    assert.equal(seed.status, 200);
    const bytes = Buffer.from(await seed.arrayBuffer());
    assert.equal(bytes.subarray(0, 15).toString(), 'SQLite format 3');
    if (!process.env.AIWS_DEMO_URL) assert.deepEqual(bytes, readFileSync(new URL('./seed/studio.sqlite', import.meta.url)));
  });

  test('a seed made for another commit, or altered, is not served; /start says why', { skip: Boolean(process.env.AIWS_DEMO_URL) }, async () => {
    const seedDir = new URL('./seed/', import.meta.url).pathname;
    const cases = [
      ['other commit', (info) => ({ ...info, commit: '0'.repeat(40) }), /made for AI Workflow Studio 0000000, but this service runs/],
      ['altered file', (info) => ({ ...info, sha256: 'f'.repeat(64) }), /does not match its record/],
    ];
    for (const [name, change, message] of cases) {
      const dir = mkdtempSync(join(tmpdir(), 'aiws-seed-'));
      cpSync(seedDir, dir, { recursive: true });
      writeFileSync(join(dir, 'seed.json'), JSON.stringify(change(JSON.parse(readFileSync(join(dir, 'seed.json'), 'utf8')))));
      const other = spawn(process.execPath, [new URL('./gateway.mjs', import.meta.url).pathname], { env: { ...process.env, PORT: '8702', AIWS_SEED_DIR: dir }, stdio: ['ignore', 'pipe', 'ignore'] });
      try {
        await new Promise((resolve) => other.stdout.on('data', (d) => String(d).includes('gateway on') && resolve()));
        const html = await (await fetch('http://127.0.0.1:8702/start')).text();
        assert.match(html, message, name);
        assert.doesNotThrow(() => new Script(html.match(/<script>([\s\S]*)<\/script>/)[1]), name);
        assert.equal((await fetch('http://127.0.0.1:8702/seed/studio.sqlite')).status, 404, name);
      } finally {
        other.kill();
        await new Promise((resolve) => other.once('exit', resolve));
      }
    }
  });
});
