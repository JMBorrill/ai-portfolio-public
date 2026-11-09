// Browser checks against the production-shaped stack (check-stack.sh starts it): the portfolio at
// https://jmborrill.co.uk framing the real studios at https://studio.jmborrill.co.uk and
// https://research.jmborrill.co.uk (resolved to this machine), with Caddy's TLS and the services'
// Secure session cookies. As a control, the same site is also served at https://elsewhere.test,
// another site, where the studios' cookies are third-party.
//
// Run in Playwright's own image, which has Chromium, Firefox and WebKit for this Playwright version
// (see README.md); BROWSERS picks them (default all three). With docker available, the recovery
// check stops and starts the QRS container.
import { chromium, devices, expect, firefox, webkit } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SITE = 'https://jmborrill.co.uk';
const ELSEWHERE = 'https://elsewhere.test';
const AIWS = 'https://studio.jmborrill.co.uk';
const QRS = 'https://research.jmborrill.co.uk';
const DEMO = { code: 'd8fad9fae5a1', result: '24357159ece3' };
const engines = { chromium, firefox, webkit };
const chosen = (process.env.BROWSERS ?? 'chromium firefox webkit').split(/\s+/).filter(Boolean);
const docker = (...args) => execFileSync('docker', args, { stdio: 'ignore' });

let failed = false;
const results = [];
const record = (browser, ok, what, detail = '') => {
  results.push({ browser, ok, what, detail });
  console.log(`${ok === null ? 'NOTE' : ok ? 'PASS' : 'FAIL'} [${browser}] ${what}${detail ? ` (${detail})` : ''}`);
  if (ok === false) failed = true;
};

async function attempt(browser, what, fn) {
  try {
    const detail = await fn();
    record(browser, true, what, detail ?? '');
  } catch (e) {
    record(browser, false, what, e.message.split('\n')[0]);
  }
}

const sessionCookie = async (context, url, name) => {
  const cookie = (await context.cookies(url)).find((c) => c.name === name);
  if (!cookie) throw new Error('the session cookie is not stored');
  const ok = cookie.secure && cookie.httpOnly && cookie.sameSite === 'Lax' && cookie.domain === new URL(url).hostname && !cookie.partitionKey;
  if (!ok) throw new Error(JSON.stringify(cookie));
  return 'Secure, HttpOnly, SameSite=Lax, host-only, unpartitioned';
};

async function aiws(name, context) {
  const page = await context.newPage();
  await attempt(name, 'AIWS: the studio opens in the workspace with the example', async () => {
    await page.goto(`${SITE}/#ai-workflow-studio/workspace`);
    await page.frameLocator('iframe.studio__frame').getByRole('heading', { level: 1, name: 'JMB lead qualification' }).waitFor({ timeout: 30_000 });
  });
  const app = page.frameLocator('iframe.studio__frame');
  await attempt(name, 'AIWS: a fixture run pauses for approval and, approved, completes', async () => {
    await app.getByRole('button', { name: 'Run with fixtures' }).click();
    await app.getByRole('button', { name: 'Approve', exact: true }).click({ timeout: 20_000 });
    await expect(app.getByTestId('run-status')).toContainText('Completed (queued)', { timeout: 20_000 });
  });
  await attempt(name, 'AIWS: the session cookie', () => sessionCookie(context, AIWS, 'aiws_demo'));
  await attempt(name, "AIWS: the studio's own storage (IndexedDB) holds the example", async () => {
    const frame = page.frames().find((f) => f.url().startsWith(AIWS));
    const stores = await frame.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open('ai-workflow-studio');
      open.onsuccess = () => resolve([...open.result.objectStoreNames]);
      open.onerror = () => reject(open.error);
    }));
    if (!stores.includes('files')) throw new Error(`stores: ${stores}`);
  });
  await page.close();
}

async function qrs(name, context) {
  const page = await context.newPage();
  const app = page.frameLocator('iframe.studio__frame');
  const run = app.getByRole('button', { name: 'Run', exact: true });
  await attempt(name, 'QRS: the studio opens in the workspace with the preloaded strategy', async () => {
    await page.goto(`${SITE}/#quant-research-studio/workspace`);
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect(app.getByText(`Valid. Compiled code ${DEMO.code}`)).toBeVisible();
  });
  await attempt(name, "QRS: a real backtest from the studio's Run button reproduces the recorded hashes", async () => {
    await run.click();
    await expect(app.locator('.runs__list .status').first()).toHaveText('succeeded', { timeout: 60_000 });
    await expect(app.locator('.hashes').first()).toContainText(`Code ${DEMO.code} · Result ${DEMO.result}`);
  });
  await attempt(name, 'QRS: Export Python downloads a ZIP', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), app.getByRole('button', { name: 'Export Python' }).click()]);
    const bytes = readFileSync(await download.path());
    if (bytes.subarray(0, 2).toString() !== 'PK') throw new Error('not a ZIP');
    return `${download.suggestedFilename()}, ${bytes.length} bytes`;
  });
  await attempt(name, 'QRS: the session cookie', () => sessionCookie(context, QRS, 'qrs_demo'));
  await attempt(name, 'QRS: Reset, confirmed, starts a fresh workspace', async () => {
    const before = await app.getByRole('combobox', { name: 'Strategy' }).inputValue();
    await page.getByRole('button', { name: 'Reset' }).click();
    await page.getByRole('button', { name: /^Discard/ }).click();
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await expect.poll(() => app.getByRole('combobox', { name: 'Strategy' }).inputValue()).not.toBe(before);
    await expect(app.locator('.runs__list .status')).toHaveCount(0);
  });
  await attempt(name, 'QRS: when the service is down the workspace says so, and Try again recovers once it is back', async () => {
    docker('stop', 'jmborrill-qrs-1');
    try {
      await page.goto('about:blank');
      await page.goto(`${SITE}/#quant-research-studio/workspace`);
      await expect(page.locator('.studio__state[role="alert"]')).toContainText('Quant Research Studio is not reachable right now.', { timeout: 30_000 });
    } finally {
      docker('start', 'jmborrill-qrs-1');
    }
    await expect.poll(async () => (await page.request.get(`${QRS}/healthz`).catch(() => null))?.status(), { timeout: 60_000 }).toBe(200);
    await page.locator('.studio__state[role="alert"]').getByRole('button', { name: 'Try again' }).click();
    await expect(run).toBeEnabled({ timeout: 30_000 });
  });
  await page.close();
}

/** A phone, emulated (viewport, touch and user agent; not the real device): QRS says before entry
 *  that editing needs a wider screen, and running, results and export work; AIWS opens. */
async function phone(name, context) {
  const page = await context.newPage();
  await attempt(name, 'phone: the QRS preview says, before entry, that editing needs a wider screen', async () => {
    await page.goto(`${SITE}/#quant-research-studio`);
    await expect(page.getByText(/cannot be selected for editing/)).toBeVisible({ timeout: 15_000 });
  });
  const app = page.frameLocator('iframe.studio__frame');
  await attempt(name, 'phone: a QRS backtest runs from the studio and reproduces the recorded hashes', async () => {
    await page.getByRole('button', { name: /^Explore/ }).first().click();
    await expect(app.getByRole('button', { name: 'Run', exact: true })).toBeEnabled({ timeout: 30_000 });
    await app.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(app.locator('.runs__list .status').first()).toHaveText('succeeded', { timeout: 60_000 });
    await expect(app.locator('.hashes').first()).toContainText(`Code ${DEMO.code} · Result ${DEMO.result}`);
  });
  await attempt(name, 'phone: QRS export downloads a ZIP', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), app.getByRole('button', { name: 'Export Python' }).click()]);
    if (readFileSync(await download.path()).subarray(0, 2).toString() !== 'PK') throw new Error('not a ZIP');
  });
  await attempt(name, 'phone: the AIWS studio opens with the example', async () => {
    const page = await context.newPage();
    await page.goto(`${SITE}/#ai-workflow-studio/workspace`);
    await page.frameLocator('iframe.studio__frame').getByRole('heading', { level: 1, name: 'JMB lead qualification' }).waitFor({ timeout: 30_000 });
  });
  await page.close();
}

/** Another site framing the studios: their cookies are third-party there. Recorded as observed. */
async function crossSite(name, context) {
  for (const [label, slug, ready] of [
    ['AIWS', 'ai-workflow-studio', (app) => app.getByRole('heading', { level: 1, name: 'JMB lead qualification' })],
    ['QRS', 'quant-research-studio', (app) => app.getByRole('button', { name: 'Run', exact: true })],
  ]) {
    const page = await context.newPage();
    await page.goto(`${ELSEWHERE}/#${slug}/workspace`);
    const outcome = await Promise.race([
      page.locator('.studio__state[role="alert"]').waitFor({ timeout: 30_000 }).then(async () => `the workspace explains: ${(await page.locator('.studio__state[role="alert"]').innerText()).replace(/\s+/g, ' ').slice(0, 90)}…`),
      ready(page.frameLocator('iframe.studio__frame')).waitFor({ timeout: 30_000 }).then(() => 'the studio opened: this browser kept the third-party cookie (partitioned)'),
    ]).catch((e) => `neither: ${e.message.split('\n')[0]}`);
    record(name, outcome.startsWith('neither') ? false : null, `cross-site control, ${label}`, outcome);
    await page.close();
  }
}

const phones = { chromium: devices['Pixel 7'], webkit: devices['iPhone 15'] };
for (const name of chosen) {
  const browser = await engines[name].launch(name === 'chromium' ? { args: ['--test-third-party-cookie-phaseout'] } : {});
  console.log(`${name} ${browser.version()}`);
  const desktop = { viewport: { width: 1440, height: 900 } };
  for (const [check, device] of [[aiws, desktop], [qrs, desktop], [crossSite, desktop], ...(phones[name] ? [[phone, phones[name]]] : [])]) {
    const context = await browser.newContext({ ...device, ignoreHTTPSErrors: true, acceptDownloads: true });
    await check(device === desktop ? name : `${name}, ${Object.keys(devices).find((k) => devices[k] === device)} emulated`, context);
    await context.close();
  }
  await browser.close();
}
console.log(`${results.filter((r) => r.ok).length} passed, ${results.filter((r) => r.ok === false).length} failed, ${results.filter((r) => r.ok === null).length} observations`);
process.exitCode = failed ? 1 : 0;
