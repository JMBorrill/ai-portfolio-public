// Public demo gateway for AI Workflow Studio.
//
// Starts the unmodified AIWS engine on loopback with a random token and no credentials, and puts
// a narrow, anonymous HTTP surface in front of it:
//   GET /healthz      liveness, for the container
//   /engine/...       an allowlist of engine endpoints, fixture mode only, each run bound to the
//                     visitor's session cookie
//   GET /start        restores the example workspace in the visitor's browser, then opens the studio
//   GET /session      whether the request carried a session cookie (checked by /start)
//   GET /...          the built studio (static files)
//
// Adapted from JMBorrill/portfolio at 042649c (demos/aiws/gateway.mjs). Changes: the studio may be
// framed by the portfolio's origins only (AIWS_FRAME_ANCESTORS), and /start preloads an example
// workflow from a database snapshot the studio itself produced (seed/, made by make-seed.mjs).
//
// Every run executes in the engine's real runtime. Fixture mode means model answers and tool
// results come from the workflow's fixtures: no model is called and no external request is made.
// Python steps (AIWS schema 2) run real code even in fixture mode, behind guardrails AIWS itself
// says are not a sandbox, so workflows with Python are refused wherever the engine would run them.
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { extname, join, normalize } from 'node:path';

const AIWS_DIR = process.env.AIWS_DIR;
if (!AIWS_DIR) throw new Error('Set AIWS_DIR to a built ai-workflow-studio checkout.');
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '127.0.0.1';
// Space-separated origins allowed to frame the studio, e.g. "https://jmborrill.co.uk". None by default.
const FRAME_ANCESTORS = process.env.AIWS_FRAME_ANCESTORS?.trim() || "'none'";
const SEED_DIR = process.env.AIWS_SEED_DIR ?? join(import.meta.dirname, 'seed');
// Behind a reverse proxy every request comes from the proxy, so the client's address is read from
// the header the proxy sets (e.g. "x-forwarded-for"); unset, from the connection. The last address
// is used: the one the proxy itself saw, which a client cannot choose.
const CLIENT_IP_HEADER = process.env.AIWS_CLIENT_IP_HEADER?.trim().toLowerCase();

const LIMITS = {
  bodyBytes: 1_000_000,
  activeRuns: 20,
  postsPerSessionPerMinute: 30,
  // Sessions cost nothing to make, so a client could otherwise take the whole allowance with many.
  // (Raised for browser tests, whose visitors all share one address.)
  postsPerClientPerMinute: Number(process.env.AIWS_DEMO_POSTS_PER_CLIENT ?? 60),
  postsPerMinute: 300,
  // The engine keeps each run in memory for an hour after it finishes (about 50 KB each), so run
  // starts per hour bound its memory.
  runsPerHour: 3_000,
  // So that one client cannot use up the hour's runs for everyone (its 60 posts a minute would).
  runsPerClientPerHour: Number(process.env.AIWS_DEMO_RUNS_PER_CLIENT ?? 300),
  bindingHours: 24,
};

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// --- The engine -------------------------------------------------------------------------------
const token = randomBytes(32).toString('hex');
// No inherited environment: no OpenAI key and no tool secrets can reach the engine.
const engine = spawn(process.execPath, [join(AIWS_DIR, 'packages', 'engine', 'dist', 'main.js')], {
  env: { PATH: process.env.PATH, AIWS_ENGINE_TOKEN: token, AIWS_ENGINE_PORT: '0', AIWS_ENGINE_QUIET: '1', AIWS_ENGINE_WATCH_STDIN: '1' },
  stdio: ['pipe', 'pipe', 'inherit'],
});
let stopping = false;
engine.once('exit', (code) => {
  if (!stopping) console.error(`engine exited unexpectedly (${code})`);
  process.exit(stopping ? 0 : 1);
});
const enginePort = await new Promise((resolve) => {
  engine.stdout.on('data', (chunk) => {
    const match = /"port":(\d+)/.exec(String(chunk));
    if (match) resolve(Number(match[1]));
  });
});

async function callEngine(method, path, body) {
  const res = await fetch(`http://127.0.0.1:${enginePort}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body,
  });
  return { status: res.status, text: await res.text() };
}

// --- Sessions, run ownership and rate limits ------------------------------------------------
const owners = new Map(); // runId -> { session, at }
const posts = new Map(); // session or client -> { minute, count }
let global = { minute: 0, count: 0 };
let hourly = { hour: 0, count: 0 };
const hourlyByClient = new Map(); // client -> { hour, count }

function sessionOf(req) {
  const match = /(?:^|;\s*)aiws_demo=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.headers.cookie ?? '');
  return match ? { id: match[1], isNew: false } : { id: randomBytes(32).toString('base64url'), isNew: true };
}

/** The client's address; for IPv6 its /64, which one subscriber usually holds whole. */
let warnedMissingHeader = false;
function clientOf(req) {
  const address = (CLIENT_IP_HEADER ? String(req.headers[CLIENT_IP_HEADER] ?? '').split(',').at(-1) : (req.socket.remoteAddress ?? '')).trim();
  if (CLIENT_IP_HEADER && !address && !warnedMissingHeader) {
    warnedMissingHeader = true;
    console.warn(`warning: requests arrive without ${CLIENT_IP_HEADER}; every visitor counts as one client. Is the proxy setting it?`);
  }
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return mapped[1];
  if (isIP(address) === 4) return address;
  if (isIP(address) !== 6) return 'unknown';
  const [head, tail] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

function allowPost(session, client) {
  const minute = Math.floor(Date.now() / 60_000);
  if (global.minute !== minute) global = { minute, count: 0 };
  if (posts.size > 10_000) posts.clear();
  const count = (key) => (posts.get(key)?.minute === minute ? posts.get(key) : { minute, count: 0 });
  const mine = count(`session ${session}`);
  const theirs = count(`client ${client}`);
  if (global.count >= LIMITS.postsPerMinute || mine.count >= LIMITS.postsPerSessionPerMinute || theirs.count >= LIMITS.postsPerClientPerMinute) return false;
  global.count += 1;
  mine.count += 1;
  theirs.count += 1;
  posts.set(`session ${session}`, mine);
  posts.set(`client ${client}`, theirs);
  return true;
}

function bind(runId, session) {
  const cutoff = Date.now() - LIMITS.bindingHours * 3_600_000;
  for (const [id, owner] of owners) if (owner.at < cutoff) owners.delete(id);
  owners.set(runId, { session, at: Date.now() });
}


const ownedBy = (runId, session) => owners.get(runId)?.session === session;

class Refusal extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > LIMITS.bodyBytes) throw new Refusal(413, 'The request is too large for the public demo.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parse(text) {
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {}
  throw new Refusal(400, 'Body must be a JSON object.');
}

/** Python steps or Python settings: what AIWS's own schema marks as needing schema version 2 for Python. */
const usesPython = (workflow) => Boolean(workflow && (workflow.python !== undefined || workflow.nodes?.some?.((n) => n?.type === 'python')));

function refusePython(body) {
  if (usesPython(body.workflow)) throw new Refusal(403, 'The public demo does not run Python steps.');
}

/** Room for one more run, which is then counted. Every limit is checked before any is counted, so
 *  a refused start uses up nothing shared. */
async function requireCapacity(client) {
  const health = JSON.parse((await callEngine('GET', '/health')).text);
  if (health.activeRuns >= LIMITS.activeRuns) throw new Refusal(503, 'The demo is busy. Try again in a minute.');
  const hour = Math.floor(Date.now() / 3_600_000);
  if (hourly.hour !== hour) hourly = { hour, count: 0 };
  if (hourlyByClient.size > 10_000) hourlyByClient.clear();
  const theirs = hourlyByClient.get(client)?.hour === hour ? hourlyByClient.get(client) : { hour, count: 0 };
  if (theirs.count >= LIMITS.runsPerClientPerHour) throw new Refusal(503, 'Your network has reached the demo’s limit for this hour. Please try again later.');
  if (hourly.count >= LIMITS.runsPerHour) throw new Refusal(503, 'The demo has reached its limit for this hour. Please try again later.');
  hourly.count += 1;
  theirs.count += 1;
  hourlyByClient.set(client, theirs);
}

/**
 * The engine's health, as the studio shows it. Python steps are refused here, so the studio is told
 * they are unavailable (it then says so in its own interface), and the server's interpreter path is
 * not shown to visitors.
 */
function publicHealth(res) {
  if (res.status !== 200) return res;
  const health = JSON.parse(res.text);
  health.python = { ok: false, error: 'Python steps are switched off in this public demo.' };
  return { status: 200, text: JSON.stringify(health) };
}

// --- The engine allowlist ---------------------------------------------------------------------
async function proxyEngine(req, path, { id: session, isNew }) {
  const method = req.method;
  const runMatch = /^\/runs\/(run_[a-z0-9]{6,60})(\/cancel)?$/.exec(path);

  if (method === 'GET' && path === '/health') return publicHealth(await callEngine('GET', '/health'));
  if (method === 'GET' && runMatch && !runMatch[2]) {
    if (!ownedBy(runMatch[1], session)) throw new Refusal(404, 'Run not found.');
    const query = new URL(req.url, 'http://gateway').search;
    return callEngine('GET', `${path}${query}`);
  }
  if (method !== 'POST') throw new Refusal(404, 'Not found.');
  // Posts need a session the browser already holds: the studio has one from its first engine
  // request (/start makes it). Otherwise a client that drops cookies would be a new session, with
  // a fresh per-session limit, on every request.
  if (isNew) throw new Refusal(403, 'No session. Reload the studio and try again.');

  // A JSON content type forces a CORS preflight, which is never granted, so another site cannot
  // post to the demo with a visitor's cookie.
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new Refusal(415, 'Send JSON.');
  if (!allowPost(session, clientOf(req))) throw new Refusal(429, 'Too many requests. Try again in a minute.');
  const text = await readBody(req);

  if (runMatch && runMatch[2]) {
    if (!ownedBy(runMatch[1], session)) throw new Refusal(404, 'Run not found.');
    return callEngine('POST', path, '{}');
  }
  if (path === '/runs') {
    const body = parse(text);
    if (body.mode !== 'fixture') throw new Refusal(403, 'The public demo runs in fixture mode only: no model is called.');
    refusePython(body);
    await requireCapacity(clientOf(req));
    // The engine assigns the run ID, so a visitor cannot choose or collide with another's.
    const res = await callEngine('POST', '/runs', JSON.stringify({ ...body, runId: undefined }));
    if (res.status === 202) bind(JSON.parse(res.text).runId, session);
    return res;
  }
  if (path === '/resume') {
    const body = parse(text);
    if (!ownedBy(body.checkpoint?.runId, session)) throw new Refusal(404, 'Run not found.');
    if (body.checkpoint.mode !== 'fixture') throw new Refusal(403, 'The public demo runs in fixture mode only.');
    refusePython(body);
    await requireCapacity(clientOf(req));
    return callEngine('POST', '/resume', text);
  }
  // Import of a ZIP export (unpacking a visitor's file) stays off; the studio shows this message.
  // Importing a workflow .json happens in the browser and needs no engine.
  if (path === '/import') throw new Refusal(403, 'Importing ZIP exports is switched off in this public demo. Import the workflow .json file instead.');
  // Exporting runs the project's fixture test, which would run its Python.
  if (path === '/export') {
    refusePython(parse(text));
    // Export runs the project's fixture test in the engine, so it counts as a run.
    await requireCapacity(clientOf(req));
  }
  if (path === '/validate' || path === '/export') return callEngine('POST', path, text);
  throw new Refusal(404, 'Not found.');
}

// --- The studio's static files --------------------------------------------------------------
const STUDIO_DIR = join(AIWS_DIR, 'studio', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function staticFile(path) {
  const file = normalize(join(STUDIO_DIR, path === '/' ? 'index.html' : path));
  if (!file.startsWith(STUDIO_DIR) || file.endsWith('.map') || !TYPES[extname(file)]) return null;
  try {
    if (!statSync(file).isFile()) return null;
    return { type: TYPES[extname(file)], body: readFileSync(file), immutable: path.startsWith('/assets/') };
  } catch {
    return null;
  }
}

// --- The example workspace ---------------------------------------------------------------------
// The studio keeps its workspace in the visitor's browser: SQLite in IndexedDB, on this service's
// origin. /start writes the snapshot into that database (ai-workflow-studio / files / studio.sqlite)
// only when the browser has no studio workspace yet, or on ?reset (the visitor's Reset), then opens
// the studio at the example workflow. It touches nothing else: no other key, no other origin. The snapshot was made by the studio itself at the
// pinned commit, by importing the example through its own Import button (make-seed.mjs), so its
// format is the studio's own. A snapshot for another commit, or one that does not match its
// recorded hash, is not served: /start explains instead.
const PIN = readFileSync(join(import.meta.dirname, 'COMMIT'), 'utf8').trim();

function loadSeed() {
  let info, bytes;
  try {
    info = readJson(join(SEED_DIR, 'seed.json'));
    bytes = readFileSync(join(SEED_DIR, 'studio.sqlite'));
  } catch {
    return { problem: 'The example workspace has not been prepared.' };
  }
  if (info.commit !== PIN) return { problem: `The example workspace was made for AI Workflow Studio ${info.commit.slice(0, 7)}, but this service runs ${PIN.slice(0, 7)}.` };
  if (createHash('sha256').update(bytes).digest('hex') !== info.sha256) return { problem: 'The example workspace file does not match its record.' };
  try {
    const head = execFileSync('git', ['-C', AIWS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (head !== PIN) return { problem: `The studio checkout is at ${head.slice(0, 7)}, not the pinned ${PIN.slice(0, 7)}.` };
  } catch {
    // No Git checkout (the container is built from the pinned commit itself).
  }
  return { bytes, info };
}
const seed = loadSeed();
if (seed.problem) console.error(`example workspace unavailable: ${seed.problem} Regenerate it with demos/aiws/make-seed.mjs.`);

// Messages to the framing page carry no data from the studio: only whether the example is ready.
const startPage = ({ route, problem }) => `<!doctype html>
<html lang="en-GB">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Opening AI Workflow Studio</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;padding:0 16px;background:#16171a;color:#e9e6df;font:16px/1.5 system-ui,sans-serif}</style>
<p role="status" id="status">Opening AI Workflow Studio…</p>
<script>
(async () => {
  const tell = (type, detail) => parent !== window && parent.postMessage({ source: 'aiws-studio', type, detail }, '*');
  const fail = (message) => {
    document.getElementById('status').textContent = 'AI Workflow Studio could not be opened: ' + message;
    tell('error', message);
  };
  // Why the example workspace cannot be served, if it cannot. It matters only where one is needed:
  // a browser that already has a workspace opens it regardless.
  const problem = ${JSON.stringify(problem ?? null)};
  try {
    const reset = new URLSearchParams(location.search).has('reset');
    // Runs are bound to the session cookie. If this browser does not keep it in this frame (a
    // site and studio on different domains, or cookies blocked), runs could not be followed: the
    // studio would wait on them indefinitely. Find out before opening it.
    await fetch('/engine/health', { cache: 'no-store' });
    const session = await (await fetch('/session', { cache: 'no-store' })).json();
    if (!session.cookie) throw Object.assign(new Error(), { name: 'NoSessionCookie' });
    // The example is written only where this browser has no studio workspace yet, or when the
    // visitor asks for Reset. Opening the workspace again, in this tab or another, never replaces
    // what is there.
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('ai-workflow-studio', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Close other tabs of the studio and try again.'));
    });
    const store = (mode) => db.transaction('files', mode).objectStore('files');
    const existing = await new Promise((resolve, reject) => {
      const get = store('readonly').get('studio.sqlite');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    if (reset || !existing) {
      if (problem) throw new Error(problem);
      const res = await fetch('/seed/studio.sqlite', { cache: 'no-store' });
      if (!res.ok) throw new Error('The example workspace is not available (' + res.status + ').');
      const bytes = new Uint8Array(await res.arrayBuffer());
      await new Promise((resolve, reject) => {
        const t = db.transaction('files', 'readwrite');
        t.objectStore('files').put(bytes, 'studio.sqlite');
        t.oncomplete = resolve;
        t.onerror = () => reject(t.error);
      });
    }
    db.close();
    tell('ready');
    location.replace('/' + ${JSON.stringify(route ?? '#/home')});
  } catch (e) {
    const name = e && e.name;
    fail(
      name === 'NoSessionCookie'
        ? 'this browser does not keep the studio’s session cookie inside this page, so its runs could not be followed. The site and the studio must be served from the same domain, with cookies allowed.'
        : name === 'SecurityError' || name === 'InvalidStateError'
        ? 'this browser does not let the embedded studio store data, which it needs for its workspace. Allowing site data for this site, or another browser, should work.'
        : name === 'VersionError'
          ? 'the studio data already in this browser has a newer format than the example workspace.'
          : String((e && e.message) || e),
    );
  }
})();
</script>
</html>`;

// --- Server -----------------------------------------------------------------------------------
const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://gateway').pathname;
  const headers = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'content-security-policy': `frame-ancestors ${FRAME_ANCESTORS}` };
  const send = (status, type, body, extra = {}) => {
    res.writeHead(status, { ...headers, 'content-type': type, ...extra });
    res.end(body);
  };
  const json = (status, body, extra) => send(status, 'application/json; charset=utf-8', body, { 'cache-control': 'no-store', ...extra });
  try {
    // Readable from any origin, so the portfolio can tell a stopped service from a running one.
    if (path === '/healthz') return json(200, '{"ok":true}', { 'access-control-allow-origin': '*' });
    if (path === '/session' && req.method === 'GET') return json(200, JSON.stringify({ cookie: !sessionOf(req).isNew }));
    if (path === '/start' && req.method === 'GET') return send(200, 'text/html; charset=utf-8', startPage({ route: seed.info?.route, problem: seed.problem }), { 'cache-control': 'no-store' });
    if (path === '/seed/studio.sqlite' && req.method === 'GET' && seed.bytes) return send(200, 'application/octet-stream', seed.bytes, { 'cache-control': 'no-cache' });
    if (path.startsWith('/engine/')) {
      const session = sessionOf(req);
      const cookie = session.isNew ? { 'set-cookie': `aiws_demo=${session.id}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax` } : {};
      const result = await proxyEngine(req, path.slice('/engine'.length), session).catch((e) => {
        if (e instanceof Refusal) return { status: e.status, text: JSON.stringify({ error: e.message }) };
        throw e;
      });
      return json(result.status, result.text, cookie);
    }
    const file = req.method === 'GET' ? staticFile(path) : null;
    if (file) return send(200, file.type, file.body, { 'cache-control': file.immutable ? 'public, max-age=31536000, immutable' : 'no-cache' });
    return json(404, '{"error":"Not found."}');
  } catch (e) {
    console.error(`gateway error on ${req.method} ${path}: ${e.message}`);
    if (!res.headersSent) json(502, '{"error":"The demo engine is not available."}');
  }
});

server.listen(PORT, HOST, () => console.log(`aiws demo gateway on http://${HOST}:${PORT}`));
// The engine gives executing runs two seconds to finish, then exits, which ends this process.
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    stopping = true;
    server.close();
    engine.kill('SIGTERM');
  });
