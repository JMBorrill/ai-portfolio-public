// One busy visitor, for measure.sh: for DURATION seconds it repeats what the demonstrated journeys
// do, as fast as the services allow. Run in a container on the stack's public network, one per
// visitor, so each has an address of its own.
//   QRS:  open a workspace; run the preloaded strategy; read its results and log; export; edit and
//         save; run that; export it; every third round, Reset (a new workspace replacing this one).
//   AIWS: run the example with fixtures to its approval and approve it; export the project, which
//         runs its fixture test too.
// Prints a JSON summary of what it did and anything refused.
import { readFileSync } from 'node:fs';

const SERVICE = process.env.SERVICE;
const BASE = `https://${process.env.HOST_NAME}`;
const until = Date.now() + Number(process.env.DURATION ?? 120) * 1000;
const FRAME = { 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'same-site' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const done = { rounds: 0, runs: 0, exports: 0, resets: 0, refused: {} };

let cookie = '';
async function request(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...headers, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  cookie = res.headers.get('set-cookie')?.split(';')[0] ?? cookie;
  const text = await res.text();
  if (res.status >= 400) {
    const key = `${res.status} ${method} ${path.replace(/[0-9a-f]{12}|run_[a-z0-9]+/g, ':id').split('?')[0]}`;
    done.refused[key] = (done.refused[key] ?? 0) + 1;
    // As the studios do, a refused visitor waits before trying again.
    if (res.status === 429 || res.status === 503) await wait(5000);
  }
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, text };
  }
}

async function qrsRound() {
  const reset = done.rounds % 3 === 2;
  const page = (await request('GET', `/start${reset ? '?reset=1' : ''}`, undefined, FRAME)).text;
  const strategy = page.match(/location\.replace\('\/#' \+ "([^"]+)"\)/)?.[1];
  if (!strategy) return wait(2000);
  if (reset) done.resets++;
  const record = (await request('GET', `/api/strategies/${strategy}`)).json;
  const runTo = async (revision) => {
    let run = (await request('POST', `/api/strategies/${strategy}/runs`, { revision })).json;
    if (!run?.id) return null;
    done.runs++;
    while (['queued', 'running'].includes(run.status)) {
      await wait(200);
      run = (await request('GET', `/api/runs/${run.id}`)).json;
    }
    return run;
  };
  const first = await runTo(record.revision);
  if (first) {
    await request('GET', `/api/runs/${first.id}/result`);
    await request('GET', `/api/runs/${first.id}/log`);
  }
  await request('GET', `/api/strategies/${strategy}/export?revision=${record.revision}`);
  done.exports++;
  const period = 10 + (done.rounds % 20);
  const document = { ...record.document, nodes: record.document.nodes.map((n) => (n.id === 'fast' ? { ...n, params: { ...n.params, period } } : n)) };
  const saved = (await request('PUT', `/api/strategies/${strategy}`, { revision: record.revision, document })).json;
  if (saved?.revision) {
    await runTo(saved.revision);
    await request('GET', `/api/strategies/${strategy}/export?revision=${saved.revision}`);
    done.exports++;
  }
}

const workflow = SERVICE === 'aiws' ? JSON.parse(readFileSync('/example/workflow.json', 'utf8')) : null;
const fixtures = SERVICE === 'aiws' ? JSON.parse(readFileSync('/example/cases/hot-finance-ops.json', 'utf8')) : null;
async function aiwsRound() {
  if (!cookie) await request('GET', '/engine/health');
  const started = (await request('POST', '/engine/runs', { workflow: { ...workflow, fixtures }, input: fixtures.input, mode: 'fixture', approvals: 'pause' })).json;
  if (started?.runId) {
    done.runs++;
    let run;
    do {
      await wait(100);
      run = (await request('GET', `/engine/runs/${started.runId}`)).json;
    } while (run?.status === 'running');
    if (run?.status === 'waiting_approval') {
      await request('POST', '/engine/resume', { workflow: { ...workflow, fixtures }, checkpoint: run.result.checkpoint, decision: { approved: true } });
    }
  }
  if ((await request('POST', '/engine/export', { workflow: { ...workflow, fixtures } })).status === 200) done.exports++;
}

while (Date.now() < until) {
  await (SERVICE === 'qrs' ? qrsRound() : aiwsRound());
  done.rounds++;
}
console.log(JSON.stringify(done));
