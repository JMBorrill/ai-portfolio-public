// Captures the experience from the running stack (check-stack.sh leaves it running), in Chromium:
// desktop at 1440 by 900 (2x) and an emulated Pixel 7; the home page, QRS's preview and a completed
// backtest, and an approved AIWS fixture run on desktop. Writes WebP files to /out.
//   docker run --rm --network host --ipc host --add-host jmborrill.co.uk:127.0.0.1 \
//     --add-host studio.jmborrill.co.uk:127.0.0.1 --add-host research.jmborrill.co.uk:127.0.0.1 \
//     -v "$PWD:/work" -w /work -v "$PWD/references/test-evidence/release:/out" \
//     mcr.microsoft.com/playwright:v1.63.0-noble node deploy/check/capture.mjs
import { chromium, devices, expect } from '@playwright/test';
import sharp from 'sharp';
const SITE = 'https://jmborrill.co.uk';
const out = '/out';
const browser = await chromium.launch();
const save = async (page, name) => {
  const png = await page.screenshot();
  await sharp(png).webp({ quality: 80 }).toFile(`${out}/${name}.webp`);
  console.log('saved', name);
};
for (const [label, device] of [['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }], ['phone', devices['Pixel 7']]]) {
  const context = await browser.newContext({ ...device, ignoreHTTPSErrors: true, acceptDownloads: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${SITE}/`);
  await page.waitForTimeout(800);
  await save(page, `${label}-home`);
  // QRS: preview (with the notice on a phone), then a completed backtest.
  await page.goto(`${SITE}/#quant-research-studio`);
  await page.waitForTimeout(800);
  await save(page, `${label}-qrs-preview`);
  await page.getByRole('button', { name: /^Explore/ }).first().click();
  const qrs = page.frameLocator('iframe.studio__frame');
  await expect(qrs.getByRole('button', { name: 'Run', exact: true })).toBeEnabled({ timeout: 30000 });
  await qrs.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(qrs.locator('.runs__list .status').first()).toHaveText('succeeded', { timeout: 60000 });
  await page.waitForTimeout(1500);
  await save(page, `${label}-qrs-run`);
  // AIWS: an approved fixture run.
  const aiwsPage = await context.newPage();
  await aiwsPage.goto(`${SITE}/#ai-workflow-studio/workspace`);
  const aiws = aiwsPage.frameLocator('iframe.studio__frame');
  await aiws.getByRole('heading', { level: 1, name: 'JMB lead qualification' }).waitFor({ timeout: 30000 });
  if (label === 'desktop') {
    await aiws.getByRole('button', { name: 'Run with fixtures' }).click();
    await aiws.getByRole('button', { name: 'Approve', exact: true }).click({ timeout: 20000 });
    await expect(aiws.getByTestId('run-status')).toContainText('Completed (queued)', { timeout: 20000 });
  }
  await aiwsPage.waitForTimeout(1000);
  await save(aiwsPage, `${label}-aiws`);
  await context.close();
}
await browser.close();
