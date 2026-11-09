// Makes the example workspace that /start restores: the real studio, at the pinned commit, imports
// the lead-qualification example through its own Import button, and the database it writes to
// IndexedDB is saved as seed/studio.sqlite. Nothing is written into the database by hand, so the
// snapshot has the studio's own format. Run it again whenever COMMIT changes.
//
// The example is corrected for this demo before import (CORRECTIONS below): it names the sender
// "James", who is Joshua. The correction is exact and counted, applied to the parsed file, and
// recorded in seed/seed.json; the source repository is not changed.
//   AIWS_DIR=/path/to/ai-workflow-studio node demos/aiws/make-seed.mjs
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const AIWS_DIR = process.env.AIWS_DIR;
if (!AIWS_DIR) throw new Error('Set AIWS_DIR to an ai-workflow-studio checkout at demos/aiws/COMMIT, built (see README.md).');
const here = import.meta.dirname;
const commit = readFileSync(join(here, 'COMMIT'), 'utf8').trim();
const head = execFileSync('git', ['-C', AIWS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== commit) throw new Error(`AIWS_DIR is at ${head}, not the pinned ${commit}.`);

const EXAMPLE = 'examples/lead-qualification/workflow.json';
const CORRECTIONS = [
  {
    pattern: /\bJames\b/g,
    replacement: 'Joshua',
    reason: 'The example names the sender "James"; the portfolio is Joshua Borrill\'s.',
    // Where the pinned example has it, and how often; anything else means the source has changed.
    expected: { '/nodes/4/config/instructions': 2, '/fixtures/input/message': 1, '/fixtures/agents/draft/output/body': 1 },
  },
];

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const sourceText = readFileSync(join(AIWS_DIR, EXAMPLE), 'utf8');

/** Applies a correction to every string in the parsed example, recording where it matched. */
function correct(value, { pattern, replacement }, path = '', found = {}) {
  if (typeof value === 'string') {
    const count = (value.match(pattern) ?? []).length;
    if (count) found[path] = count;
    return value.replace(pattern, replacement);
  }
  if (Array.isArray(value)) return value.map((v, i) => correct(v, { pattern, replacement }, `${path}/${i}`, found));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, correct(v, { pattern, replacement }, `${path}/${k}`, found)]));
  return value;
}

let workflow = JSON.parse(sourceText);
const applied = CORRECTIONS.map((c) => {
  const found = {};
  workflow = correct(workflow, c, '', found);
  if (JSON.stringify(found) !== JSON.stringify(c.expected)) throw new Error(`Correction ${c.pattern} found ${JSON.stringify(found)}, expected ${JSON.stringify(c.expected)}. Review it for this commit.`);
  return { find: String(c.pattern), replace: c.replacement, reason: c.reason, at: found };
});
const correctedText = JSON.stringify(workflow, null, 2) + '\n';
const importDir = mkdtempSync(join(tmpdir(), 'aiws-example-'));
writeFileSync(join(importDir, 'workflow.json'), correctedText);
const port = 8799;
const gateway = spawn(process.execPath, [join(here, 'gateway.mjs')], { env: { ...process.env, PORT: String(port), AIWS_SEED_DIR: '/nonexistent' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve) => gateway.stdout.on('data', (d) => String(d).includes('gateway on') && resolve()));

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/#/home`);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import' }).first().click()]);
  await chooser.setFiles(join(importDir, 'workflow.json'));
  await page.getByRole('heading', { level: 1, name: workflow.name }).waitFor();
  await page.getByTestId('save-status').filter({ hasText: 'Saved locally' }).waitFor();
  const bytes = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('ai-workflow-studio', 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const get = req.result.transaction('files').objectStore('files').get('studio.sqlite');
          get.onsuccess = () => resolve(Array.from(get.result));
          get.onerror = () => reject(get.error);
        };
      }),
  );
  mkdirSync(join(here, 'seed'), { recursive: true });
  const sqlite = Buffer.from(bytes);
  writeFileSync(join(here, 'seed', 'studio.sqlite'), sqlite);
  const info = {
    commit,
    source: EXAMPLE,
    sourceSha256: sha256(sourceText),
    corrections: applied,
    correctedSha256: sha256(correctedText),
    workflowId: workflow.id,
    workflowName: workflow.name,
    route: `#/workflows/${workflow.id}/test`,
    sha256: sha256(sqlite),
    madeBy: 'demos/aiws/make-seed.mjs',
  };
  writeFileSync(join(here, 'seed', 'seed.json'), JSON.stringify(info, null, 2) + '\n');
  console.log(`seed/studio.sqlite: ${bytes.length} bytes, ${workflow.name} (${workflow.id}) at ${commit.slice(0, 7)}`);
} finally {
  await browser.close();
  gateway.kill();
}
