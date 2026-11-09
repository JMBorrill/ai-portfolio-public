import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test, type FrameLocator, type Page } from "@playwright/test";

// The Quant Research Studio Living Project: the real studio and research engine inside the
// workspace, served by demos/qrs (QRS_DIR or QRS_STUDIO; see playwright.config.ts). The site must be
// built with NEXT_PUBLIC_QRS_STUDIO_URL=http://localhost:8766.

const qrsAvailable = Boolean(process.env.QRS_DIR || process.env.QRS_STUDIO);
const needsQrs = () => test.skip(!qrsAvailable, "Needs the Quant Research Studio demo service (set QRS_DIR or QRS_STUDIO).");

const PREVIEW = "/#quant-research-studio";
const WORKSPACE = "/#quant-research-studio/workspace";
const STUDIO = "http://localhost:8766";
// QRS's recorded hashes for the EMA crossover on its synthetic dataset (scripts/check-hashes.py).
const DEMO = { code: "d8fad9fae5a1", result: "24357159ece3" };

const dialog = (page: Page) => page.getByRole("dialog", { name: /Backtesting Platform/ });
const openButton = (page: Page) => page.getByRole("button", { name: /^Open the project.*Backtesting Platform$/ });
const studio = (page: Page): FrameLocator => page.frameLocator("iframe.studio__frame");
const studioFrame = (page: Page) => page.frames().find((f) => f.url().startsWith(`${STUDIO}/`))!;
const runButton = (page: Page) => studio(page).getByRole("button", { name: "Run", exact: true });
const strategySelect = (page: Page) => studio(page).getByRole("combobox", { name: "Strategy" });

async function openQrs(page: Page, path = WORKSPACE) {
  await page.goto(path);
  await expect(runButton(page)).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator(".studio__state")).toHaveCount(0);
}

/** Runs the open strategy and waits for the run to finish; returns its hashes line. */
async function run(page: Page) {
  const started = page.waitForResponse((r) => /\/api\/strategies\/[^/]+\/runs$/.test(r.url()) && r.request().method() === "POST");
  await runButton(page).click();
  const { id } = await (await started).json();
  await expect(studio(page).locator(`.runs__list .status`).first()).toHaveText(/succeeded|failed/, { timeout: 60_000 });
  return { id, hashes: studio(page).locator(".hashes").first() };
}

// QRS's studio has fixed-width side panels: below 760 pixels they cover the canvas, so a node cannot
// be tapped to edit it. That is the application's own layout, recorded as a limitation and said in
// the preview before entry; editing is tested on wider screens only. Running, results and export
// are tested on both.
const NARROW = 760;
const PHONE_EDITING = "Below 760 pixels QRS's panels cover its canvas, so nodes cannot be tapped to edit (an application limitation).";

async function setFastPeriod(page: Page, period: number) {
  await studio(page).locator(".react-flow__node").filter({ hasText: "fast" }).first().click();
  const field = studio(page).getByLabel("Period");
  await field.fill(String(period));
  await expect(studio(page).locator(".save")).toHaveText("Saved", { timeout: 10_000 });
  // Deselect the node, as a visitor would by clicking the canvas, so the strategy summary shows again.
  await studio(page).locator(".react-flow__pane").click({ position: { x: 10, y: 10 } });
}

test.describe("the workspace", () => {
  test("card → preview → workspace, labelled synthetic; Tab enters and leaves the studio; Escape and Close return focus to the card", async ({ page, browserName }) => {
    needsQrs();
    await page.goto("/");
    await page.getByRole("tab", { name: /^Research/ }).click();
    await openButton(page).click();
    await expect(page).toHaveURL(PREVIEW);
    await expect(page.getByRole("heading", { name: "Backtesting Platform Overview" })).toBeFocused();
    await dialog(page).getByRole("button", { name: /^Explore/ }).first().click();
    await expect(page).toHaveURL(WORKSPACE);
    await expect(dialog(page)).toHaveAccessibleDescription(/^Synthetic data \(seed 42\): not market prices or investment performance\./);
    await expect(runButton(page)).toBeEnabled({ timeout: 30_000 });
    await expect(strategySelect(page)).toContainText("EMA crossover");
    await page.getByRole("button", { name: "Close" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("iframe.studio__frame")).toBeFocused();
    if (browserName === "firefox") {
      // Firefox, as for any frame, stops first on the frame's document; Shift+Tab from there would
      // go to the studio's last control. On to its first control.
      expect(await studioFrame(page).evaluate(() => document.activeElement === document.body)).toBe(true);
      await page.keyboard.press("Tab");
    }
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL("/");
    await expect(openButton(page)).toBeFocused();
    await page.goto(WORKSPACE);
    await expect(runButton(page)).toBeEnabled({ timeout: 30_000 });
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page).toHaveURL("/");
    await expect(openButton(page)).toBeFocused();
  });

  test("on a narrow screen the preview says, before entry, that editing needs a wider one", async ({ page }) => {
    await page.goto(PREVIEW);
    const notice = dialog(page).getByText(/cannot be selected for editing/);
    const mode = page.locator(".living__mode .living__narrow");
    if (page.viewportSize()!.width < NARROW) {
      await expect(notice).toBeVisible();
      await expect(notice).toContainText("Running the backtest, reading its results and exporting it all work.");
      await dialog(page).getByRole("button", { name: /^Explore/ }).first().click();
      await expect(mode).toBeVisible();
      await expect(dialog(page)).toHaveAccessibleDescription(/editing needs a wider one; running, results and export work\.$/);
    } else {
      await expect(notice).toBeHidden();
      await dialog(page).getByRole("button", { name: /^Explore/ }).first().click();
      await expect(mode).toBeHidden();
      await expect(dialog(page)).toHaveAccessibleDescription(/own engine\.$/);
    }
  });

  test("when the studio cannot be reached, the workspace says so and recovers on retry", async ({ page }) => {
    await page.route(`${STUDIO}/healthz`, (route) => route.abort());
    await page.goto(WORKSPACE);
    const alert = dialog(page).getByRole("alert");
    await expect(alert).toContainText("Backtesting Platform is not reachable right now.");
    await expect(alert.getByRole("link", { name: "case study" })).toHaveAttribute("href", "/projects/quant-research-studio/");
    if (!qrsAvailable) return;
    await page.unroute(`${STUDIO}/healthz`);
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(runButton(page)).toBeEnabled({ timeout: 30_000 });
  });

  test("when the proxy answers but the service behind it is down, the workspace says it is not reachable", async ({ page }) => {
    // As Caddy does for a stopped upstream: a response, but an error without the service's headers.
    await page.route(`${STUDIO}/healthz`, (route) => route.fulfill({ status: 502, body: "" }));
    await page.goto(WORKSPACE);
    await expect(dialog(page).getByRole("alert")).toContainText("Backtesting Platform is not reachable right now.");
  });

  test("when the session cookie is not kept in the frame, the workspace says so", async ({ page }) => {
    needsQrs();
    await page.route(`${STUDIO}/session`, (route) => route.fulfill({ json: { cookie: false } }));
    await page.goto(WORKSPACE);
    await expect(dialog(page).getByRole("alert")).toContainText("does not keep the studio’s session cookie inside this page");
  });

  test("the case study links into the workspace and stays complete without JavaScript", async ({ page, browser }) => {
    await page.goto("/projects/quant-research-studio/");
    await page.getByRole("link", { name: "Explore the workspace" }).click();
    await expect(page).toHaveURL(WORKSPACE);
    const context = await browser.newContext({ javaScriptEnabled: false });
    const plain = await context.newPage();
    await plain.goto("/projects/quant-research-studio/");
    await expect(plain.getByRole("heading", { name: "Reproducibility by construction" })).toBeVisible();
    await expect(plain.getByRole("link", { name: "Explore the workspace" })).toHaveCount(0);
    await context.close();
  });
});

test.describe("the real studio and engine", () => {
  test.beforeEach(needsQrs);

  test("a real backtest of the preloaded strategy reproduces QRS’s recorded hashes, with results and log", async ({ page }) => {
    await openQrs(page);
    await expect(studio(page).getByText(`Valid. Compiled code ${DEMO.code}`)).toBeVisible();
    const { id, hashes } = await run(page);
    await expect(studio(page).locator(".runs__list .status").first()).toHaveText("succeeded");
    await expect(hashes).toContainText(`Code ${DEMO.code} · Result ${DEMO.result}`);
    await expect(studio(page).getByText("Evidence: synthetic, the weakest class among the datasets this run read.")).toBeVisible();
    await expect(studio(page).getByText("Net P&L")).toBeVisible();
    await expect(hashes.getByRole("link", { name: "Log" })).toHaveAttribute("href", `/api/runs/${id}/log`);
    expect(await studioFrame(page).evaluate(async (runId) => (await fetch(`/api/runs/${runId}/log`)).status, id)).toBe(200);
  });

  test("editing a parameter saves a revision, recompiles and runs as different code", async ({ page }) => {
    test.skip(page.viewportSize()!.width < NARROW, PHONE_EDITING);
    await openQrs(page);
    await setFastPeriod(page, 15);
    await expect(studio(page).getByText(/^Valid\. Compiled code /)).not.toContainText(DEMO.code);
    const { hashes } = await run(page);
    await expect(studio(page).locator(".runs__list .status").first()).toHaveText("succeeded");
    await expect(studio(page).locator(".runs__list").first()).toContainText("rev 2");
    await expect(hashes).not.toContainText(DEMO.code);
  });

  test("Export Python downloads the strategy as a standalone bundle", async ({ page }) => {
    await openQrs(page);
    const [download] = await Promise.all([page.waitForEvent("download"), studio(page).getByRole("button", { name: "Export Python" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^strategy-[a-f0-9]+-r1\.zip$/);
    expect(readFileSync((await download.path())!).subarray(0, 2).toString()).toBe("PK");
  });

  test("features outside the journey show the demo's refusal in the studio", async ({ page }) => {
    await openQrs(page);
    await studio(page).getByRole("button", { name: "Research…" }).click();
    await expect(studio(page).getByText("This part of Quant Research Studio is not available in the demo.").first()).toBeVisible();
  });

  test("one visitor cannot see another visitor's strategy or runs", async ({ page, browser }) => {
    await openQrs(page);
    const { id } = await run(page);
    const mine = await strategySelect(page).inputValue();
    const stranger = await (await browser.newContext()).newPage();
    await openQrs(stranger);
    expect(await strategySelect(stranger).inputValue()).not.toBe(mine);
    await expect(strategySelect(stranger).locator("option")).toHaveCount(1);
    const status = (path: string) => studioFrame(stranger).evaluate(async (p) => (await fetch(p)).status, path);
    expect(await status(`/api/runs/${id}`)).toBe(404);
    expect(await status(`/api/strategies/${mine}`)).toBe(404);
    await stranger.context().close();
  });

  test("a second tab shares the workspace; Reset, once confirmed, starts a fresh one, which the other tab then shares", async ({ page, context }) => {
    test.skip(page.viewportSize()!.width < NARROW, PHONE_EDITING);
    await openQrs(page);
    await setFastPeriod(page, 13);
    const first = await strategySelect(page).inputValue();
    const second = await context.newPage();
    await openQrs(second);
    expect(await strategySelect(second).inputValue()).toBe(first);

    await page.getByRole("button", { name: "Reset" }).click();
    await page.getByRole("button", { name: /^Discard/ }).click();
    await expect(runButton(page)).toBeEnabled({ timeout: 30_000 });
    await expect.poll(() => strategySelect(page).inputValue()).not.toBe(first);
    await expect(studio(page).getByText(`Valid. Compiled code ${DEMO.code}`)).toBeVisible();
    // The other tab still shows the old strategy, which the new session does not have, until it reloads.
    const status = (path: string) => studioFrame(second).evaluate(async (p) => (await fetch(p)).status, path);
    expect(await status(`/api/strategies/${first}`)).toBe(404);
    await second.reload();
    await expect(runButton(second)).toBeEnabled({ timeout: 30_000 });
    await expect.poll(() => strategySelect(second).inputValue()).toBe(await strategySelect(page).inputValue());
    await second.close();
  });

  test("the portfolio's own controls have no accessibility violations", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: /^Research/ }).click();
    await openButton(page).click();
    await page.waitForTimeout(700); // let the expansion settle so contrast is measured at rest
    const preview = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(preview.violations.map((v) => v.id)).toEqual([]);
    await dialog(page).getByRole("button", { name: /^Explore/ }).first().click();
    await expect(runButton(page)).toBeEnabled({ timeout: 30_000 });
    // The studio is QRS's own; here only the portfolio around it is checked.
    const workspace = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).exclude("iframe").analyze();
    expect(workspace.violations.map((v) => v.id)).toEqual([]);
  });
});
