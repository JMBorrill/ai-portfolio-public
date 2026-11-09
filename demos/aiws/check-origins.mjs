// Checks the embedding under production-shaped origins rather than two ports of localhost: the site
// at https://jmborrill.localhost and the studio at https://studio.jmborrill.localhost (one registrable
// domain, as jmborrill.co.uk and studio.jmborrill.co.uk would be), with real TLS and Secure cookies,
// in Chromium with third-party cookies blocked. As a control, the same site is also served from
// https://elsewhere.localhost, a different site, where the studio's cookie is third-party.
// (*.localhost names resolve to this machine without changing system settings.)
//
// Prerequisites: a built AI Workflow Studio checkout (AIWS_DIR), and the site built for these origins:
//   NEXT_PUBLIC_AIWS_STUDIO_URL=https://studio.jmborrill.localhost:9443 npm run build
//   AIWS_DIR=/path/to/ai-workflow-studio node demos/aiws/check-origins.mjs
import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const AIWS_DIR = process.env.AIWS_DIR;
if (!AIWS_DIR) throw new Error('Set AIWS_DIR (see README.md).');
const root = join(import.meta.dirname, '..', '..');
const SITE = 'https://jmborrill.localhost:8443';
const ELSEWHERE = 'https://elsewhere.localhost:8443';
const STUDIO = 'https://studio.jmborrill.localhost:9443';
const chunks = join(root, 'out', '_next', 'static', 'chunks');
if (!readdirSync(chunks).some((f) => readFileSync(join(chunks, f), 'utf8').includes(STUDIO))) throw new Error(`Build the site with NEXT_PUBLIC_AIWS_STUDIO_URL=${STUDIO} first.`);

// A self-signed certificate for the three names; the browser is told to accept it.
const dir = mkdtempSync(join(tmpdir(), 'aiws-origins-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=jmborrill.localhost', '-addext', 'subjectAltName=DNS:jmborrill.localhost,DNS:studio.jmborrill.localhost,DNS:elsewhere.localhost', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
const tls = { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) };

const children = [
  spawn(process.execPath, [join(import.meta.dirname, 'gateway.mjs')], { env: { ...process.env, PORT: '8791', AIWS_FRAME_ANCESTORS: `${SITE} ${ELSEWHERE}` }, stdio: ['ignore', 'pipe', 'inherit'] }),
  spawn(process.execPath, [join(root, 'scripts', 'serve.mjs')], { env: { ...process.env, PORT: '4174' }, stdio: ['ignore', 'pipe', 'inherit'] }),
];
await Promise.all(children.map((c) => new Promise((resolve) => c.stdout.on('data', (d) => /gateway on|site on/.test(String(d)) && resolve()))));

// TLS in front of each, as a production proxy would be.
const proxy = (port, target) =>
  createServer(tls, (req, res) => {
    const upstream = request({ host: '127.0.0.1', port: target, method: req.method, path: req.url, headers: req.headers }, (reply) => {
      res.writeHead(reply.statusCode, reply.headers);
      reply.pipe(res);
    });
    req.pipe(upstream);
  }).listen(port, '127.0.0.1');
const proxies = [proxy(8443, 4174), proxy(9443, 8791)];

const browser = await chromium.launch({
  args: ['--test-third-party-cookie-phaseout', '--no-proxy-server'],
});

async function visit(site) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const result = { site };
  try {
    await page.goto(`${site}/#ai-workflow-studio/workspace`);
    const app = page.frameLocator('iframe.studio__frame');
    await app.getByRole('heading', { level: 1, name: 'JMB lead qualification' }).waitFor({ timeout: 20_000 });
    result.studioOpened = true;
    await app.getByRole('button', { name: 'Run with fixtures' }).click();
    const outcome = await Promise.race([
      app.getByRole('button', { name: 'Approve', exact: true }).waitFor({ timeout: 15_000 }).then(() => 'paused for approval'),
      app.getByText(/Run not found|not found/i).first().waitFor({ timeout: 15_000 }).then(async () => `failed: ${(await app.getByText(/not found/i).first().textContent()).trim()}`),
    ]).catch(async () => `no result in 15 s; the test panel shows: ${(await app.getByTestId('run-status').or(app.getByText(/Latest run/i)).first().locator('..').innerText().catch(() => '?')).replace(/\s+/g, ' ').slice(0, 160)}`);
    result.run = outcome;
    if (outcome === 'paused for approval') {
      await app.getByRole('button', { name: 'Approve', exact: true }).click();
      await app.getByTestId('run-status').filter({ hasText: 'Completed (queued)' }).waitFor({ timeout: 15_000 });
      result.run = (await app.getByTestId('run-status').textContent()).trim();
    }
    const cookie = (await context.cookies(STUDIO)).find((c) => c.name === 'aiws_demo');
    result.cookie = cookie ? { secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, domain: cookie.domain, partitionKey: cookie.partitionKey ?? null } : 'not stored';
  } catch (e) {
    const shown = await page.locator('.studio__state').innerText().catch(() => '');
    result.error = shown ? `The workspace shows: ${shown.replace(/\s+/g, ' ').trim()}` : e.message.split('\n')[0];
  } finally {
    await context.close();
  }
  return result;
}

let failed = false;
try {
  const sameSite = await visit(SITE);
  const crossSiteControl = await visit(ELSEWHERE);
  console.log(JSON.stringify({ sameSite, crossSiteControl }, null, 2));
  const expect = (ok, what) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${what}`);
    failed ||= !ok;
  };
  expect(sameSite.studioOpened === true, 'same site: the studio opens with the example');
  expect(/^Completed \(queued\) · Fixture run/.test(sameSite.run ?? ''), 'same site: an approved fixture run completes');
  expect(sameSite.cookie?.secure && sameSite.cookie?.httpOnly && sameSite.cookie?.sameSite === 'Lax' && sameSite.cookie?.domain === 'studio.jmborrill.localhost' && !sameSite.cookie?.partitionKey, 'same site: the session cookie is Secure, HttpOnly, SameSite=Lax, host-only and unpartitioned');
  expect(/does not keep the studio’s session cookie/.test(crossSiteControl.error ?? ''), 'cross site: the workspace explains that the session cookie is not kept');
} finally {
  await browser.close();
  proxies.forEach((p) => p.close());
  children.forEach((c) => c.kill());
}
process.exitCode = failed ? 1 : 0;
