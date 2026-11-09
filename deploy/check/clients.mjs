// Runs in a container on the stack's public network, as a visitor on the internet would be: through
// Caddy, over HTTPS, from an address of its own. check-stack.sh starts it twice, as two clients.
//   ROLE=first: the full journey of each service (the image smoke test), then client identification
//               with forged X-Forwarded-For headers.
//   ROLE=second: another client, which the first's sessions and requests must not affect.
// Prints one line per check, PASS or FAIL, and exits 1 on any failure.
import { readFileSync } from 'node:fs';

const ROLE = process.env.ROLE;
const AIWS = `https://${process.env.AIWS_HOST}`;
const QRS = `https://${process.env.QRS_HOST}`;
const EXAMPLE = '/example'; // AIWS's examples/lead-qualification, mounted read-only
// QRS's recorded hashes for the EMA crossover on its synthetic dataset (scripts/check-hashes.py).
const DEMO = { code: 'd8fad9fae5a10cc52f7eb53bb08c45b56aa70118e1f516bc577809468c81d1ec', result: '24357159ece368e027d8249f2065a87ae0725b2bec05353262289125d6239a6c' };
const FRAME = { 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'same-site' };

let failed = false;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} [${ROLE}] ${what}${detail ? ` (${detail})` : ''}`);
  failed ||= !ok;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A visitor with its own session cookie; `forwarded` is sent as X-Forwarded-For, as a client may. */
function visitor(base, forwarded) {
  let cookie = '';
  const request = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(forwarded ? { 'x-forwarded-for': forwarded } : {}), ...headers, cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    cookie = res.headers.get('set-cookie')?.split(';')[0] ?? cookie;
    const buffer = Buffer.from(await res.arrayBuffer());
    let json;
    try {
      json = JSON.parse(buffer.toString());
    } catch {}
    return { status: res.status, json, buffer, text: buffer.toString() };
  };
  const startQrs = async () => {
    const page = (await request('GET', '/start', undefined, FRAME)).text;
    return { problem: JSON.parse(page.match(/const problem = (.*);/)[1]), strategy: page.match(/location\.replace\('\/#' \+ "([^"]+)"\)/)?.[1] };
  };
  return { request, startQrs };
}

async function qrsJourney() {
  const v = visitor(QRS);
  const { problem, strategy } = await v.startQrs();
  check(problem === null && Boolean(strategy), 'QRS: /start opens a workspace with the preloaded strategy', problem ?? '');
  const record = (await v.request('GET', `/api/strategies/${strategy}`)).json;
  const runTo = async (revision) => {
    let run = (await v.request('POST', `/api/strategies/${strategy}/runs`, { revision })).json;
    while (['queued', 'running'].includes(run.status)) {
      await wait(250);
      run = (await v.request('GET', `/api/runs/${run.id}`)).json;
    }
    return run;
  };
  const first = await runTo(1);
  check(first.status === 'succeeded' && first.code_sha256 === DEMO.code && first.result_sha256 === DEMO.result, "QRS: a real backtest in the image reproduces QRS's recorded code and result hashes", `${first.status} ${first.code_sha256?.slice(0, 12)} ${first.result_sha256?.slice(0, 12)}`);
  const result = await v.request('GET', `/api/runs/${first.id}/result`);
  check(result.status === 200 && result.json.evidence_class === 'synthetic', 'QRS: results are served, labelled synthetic');
  check((await v.request('GET', `/api/runs/${first.id}/log`)).status === 200, 'QRS: the log is served');
  const document = { ...record.document, nodes: record.document.nodes.map((n) => (n.id === 'fast' ? { ...n, params: { ...n.params, period: 15 } } : n)) };
  check((await v.request('POST', '/api/compile', { document })).status === 200, 'QRS: an edit compiles');
  const saved = await v.request('PUT', `/api/strategies/${strategy}`, { revision: 1, document });
  const edited = await runTo(saved.json.revision);
  check(saved.json.revision === 2 && edited.status === 'succeeded' && edited.code_sha256 !== DEMO.code, 'QRS: the edit saves revision 2 and runs as different code');
  const bundle = await v.request('GET', `/api/strategies/${strategy}/export?revision=2`);
  check(bundle.status === 200 && bundle.buffer.subarray(0, 2).toString() === 'PK', 'QRS: export downloads a ZIP bundle', `${bundle.buffer.length} bytes`);
  check((await v.request('POST', '/api/strategies', {})).status === 404, 'QRS: endpoints outside the journey are refused');
}

async function aiwsJourney() {
  const v = visitor(AIWS);
  check((await v.request('GET', '/start')).status === 200, 'AIWS: /start serves the example');
  await v.request('GET', '/engine/health'); // as the studio does first: it gets the session
  const workflow = JSON.parse(readFileSync(`${EXAMPLE}/workflow.json`, 'utf8'));
  const fixtures = JSON.parse(readFileSync(`${EXAMPLE}/cases/hot-finance-ops.json`, 'utf8'));
  const poll = async (runId) => {
    for (;;) {
      const run = (await v.request('GET', `/engine/runs/${runId}`)).json;
      if (run.status !== 'running') return run;
      await wait(50);
    }
  };
  const started = await v.request('POST', '/engine/runs', { workflow: { ...workflow, fixtures }, input: fixtures.input, mode: 'fixture', approvals: 'pause' });
  const paused = await poll(started.json.runId);
  check(paused.status === 'waiting_approval', 'AIWS: a fixture run in the real runtime pauses for approval', paused.status);
  const resumed = await v.request('POST', '/engine/resume', { workflow: { ...workflow, fixtures }, checkpoint: paused.result.checkpoint, decision: { approved: true } });
  const done = resumed.status === 202 ? await poll(started.json.runId) : {};
  check(done.status === 'completed' && done.result?.outcome === 'queued', 'AIWS: approved, it completes', `${done.status} ${done.result?.outcome}`);
  check((await v.request('POST', '/engine/runs', { workflow: { ...workflow, fixtures }, input: fixtures.input, mode: 'live' })).status === 403, 'AIWS: live mode is refused');
}

if (ROLE === 'first') {
  await qrsJourney();
  await aiwsJourney();

  // QRS: this client already holds one workspace. Each new one claims, in X-Forwarded-For, to come
  // from somewhere else. The services read the last address, the one Caddy saw, so all count as this
  // client's: two more fit its limit of 3, and the next is refused.
  const forged = [];
  for (const address of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) forged.push((await visitor(QRS, address).startQrs()).problem);
  check(forged[0] === null && forged[1] === null && /Too many workspaces are open from your network/.test(forged[2] ?? ''), 'QRS: forged X-Forwarded-For headers do not escape the per-client limit of 3 workspaces', JSON.stringify(forged));

  // AIWS: 61 posts, each from a new session claiming one of three other addresses, exceed the client's 60 a
  // minute (the journey above made some already).
  const statuses = [];
  for (let i = 0; i < 61; i++) {
    const v = visitor(AIWS, `198.51.100.${i % 3}`);
    await v.request('GET', '/engine/health');
    statuses.push((await v.request('POST', '/engine/validate', { workflow: {} })).status);
  }
  check(statuses.includes(429), 'AIWS: forged X-Forwarded-For headers do not escape the per-client limit of 60 posts a minute', `first 429 at post ${statuses.indexOf(429) + 1}`);
} else {
  // Another client, while the first holds its 3 workspaces and has used its posts.
  check((await visitor(QRS).startQrs()).problem === null, 'QRS: another client still gets a workspace');
  const v = visitor(AIWS);
  await v.request('GET', '/engine/health');
  const status = (await v.request('POST', '/engine/validate', { workflow: {} })).status;
  check(status !== 429, 'AIWS: another client can still post', String(status));
}
process.exitCode = failed ? 1 : 0;
