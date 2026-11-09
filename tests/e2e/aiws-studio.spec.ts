import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test, type FrameLocator, type Page } from "@playwright/test";

// The AI Workflow Studio Living Project: the portfolio's card → preview → workspace, and the real
// studio inside it. Tests marked `needsStudio` drive the application itself, served by the demo
// service (AIWS_DIR or AIWS_STUDIO; see playwright.config.ts). The site must be built with
// NEXT_PUBLIC_AIWS_STUDIO_URL=http://localhost:8790.

const studioAvailable = Boolean(process.env.AIWS_DIR || process.env.AIWS_STUDIO);
const needsStudio = () => test.skip(!studioAvailable, "Needs the AI Workflow Studio demo service (set AIWS_DIR or AIWS_STUDIO).");

const PREVIEW = "/#ai-workflow-studio";
const WORKSPACE = "/#ai-workflow-studio/workspace";
const EXAMPLE = "JMB lead qualification";

const dialog = (page: Page) => page.getByRole("dialog", { name: /AI Workflow Studio/ });
const overviewHeading = (page: Page) => page.getByRole("heading", { name: "AI Workflow Studio Overview" });
const workspaceHeading = (page: Page) => page.getByRole("heading", { name: "AI Workflow Studio Workspace" });
const openButton = (page: Page) => page.getByRole("button", { name: /^Open the project.*AI Workflow Studio$/ });
const explore = (page: Page) => dialog(page).getByRole("button", { name: /^Explore/ }).first();
const studio = (page: Page): FrameLocator => page.frameLocator("iframe.studio__frame");
const frameBox = (page: Page) => page.locator(".living__frame").evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);

/** Opens the workspace and waits for the studio to show the example workflow. */
async function openStudio(page: Page, path = WORKSPACE) {
  await page.goto(path);
  await expect(studio(page).getByRole("heading", { level: 1, name: EXAMPLE })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".studio__state")).toHaveCount(0);
}

/** On narrow screens the studio keeps its test panel in a drawer. */
async function showTestPanel(page: Page) {
  const run = studio(page).getByRole("button", { name: "Run with fixtures" });
  const show = studio(page).getByRole("button", { name: /^Show inspector/ });
  // Wait for whichever the layout renders: the panel's Run button, or the control that opens it.
  await expect(run.or(show).first()).toBeVisible();
  if (!(await run.isVisible())) await show.click();
  await expect(run).toBeVisible();
}

async function runToApproval(page: Page) {
  await showTestPanel(page);
  await studio(page).getByRole("button", { name: "Run with fixtures" }).click();
  await expect(studio(page).getByRole("button", { name: "Approve", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(studio(page).getByText("Send this reply?").filter({ visible: true }).first()).toBeVisible();
}

const runStatus = (page: Page) => studio(page).getByTestId("run-status");
const revision = (page: Page) => studio(page).getByTestId("save-status").locator("..");

/** Selects a step in Design mode and returns once its form is showing (drawers on narrow screens). */
async function editStep(page: Page, step: RegExp) {
  await studio(page).getByRole("tab", { name: "Design" }).click();
  const list = studio(page).getByRole("list", { name: "Steps in run order" }).filter({ visible: true });
  if (!(await list.count())) await studio(page).getByRole("button", { name: /^Show navigator/ }).click();
  await list.first().getByRole("button", { name: step }).click();
  const label = studio(page).getByLabel("Label").filter({ visible: true });
  if (!(await label.count())) {
    // Narrow layout: close the navigator drawer, as a visitor would, then open the inspector.
    await studio(page).getByRole("button", { name: /^Close navigator/ }).click();
    await studio(page).getByRole("button", { name: /^Show inspector/ }).click();
  }
  await expect(label.first()).toBeVisible();
}

test.describe("the workspace around the studio", () => {
  test("card → preview → workspace, with history, Back, Close, focus and scroll restored", async ({ page }) => {
    needsStudio();
    await page.goto("/");
    await page.getByRole("tab", { name: "AI Automation" }).click();
    await openButton(page).scrollIntoViewIfNeeded();
    const scrollY = await page.evaluate(() => window.scrollY);
    await openButton(page).click();
    await expect(page).toHaveURL(PREVIEW);
    await expect(overviewHeading(page)).toBeFocused();
    await expect(page.locator("main")).toHaveJSProperty("inert", true);
    await explore(page).click();
    await expect(page).toHaveURL(WORKSPACE);
    await expect(workspaceHeading(page)).toBeFocused();
    await expect(dialog(page)).toContainText("Fixture mode: recorded model and tool responses. No live AI is called and nothing is sent.");
    await expect(studio(page).getByRole("heading", { level: 1, name: EXAMPLE })).toBeVisible({ timeout: 20_000 });

    await page.goBack();
    await expect(page).toHaveURL(PREVIEW);
    await expect(overviewHeading(page)).toBeVisible();
    await page.goForward();
    await expect(workspaceHeading(page)).toBeVisible();
    await expect(studio(page).getByRole("heading", { level: 1, name: EXAMPLE })).toBeVisible();

    await page.getByRole("button", { name: "Back to the overview" }).click();
    await expect(page).toHaveURL(PREVIEW);
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page).toHaveURL("/");
    await expect(dialog(page)).toBeHidden();
    await expect(openButton(page)).toBeFocused();
    await expect(page.locator("main")).toHaveJSProperty("inert", false);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  });

  test("Escape inside the studio belongs to the studio; from the workspace bar it closes the project", async ({ page }) => {
    needsStudio();
    await openStudio(page);
    await showTestPanel(page);
    await studio(page).getByRole("button", { name: "Run with fixtures" }).focus();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(WORKSPACE);
    await page.getByRole("button", { name: "Reset" }).focus();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL("/");
    await expect(dialog(page)).toBeHidden();
  });

  test("the keyboard moves from the workspace bar into the studio and back out", async ({ page, browserName }) => {
    needsStudio();
    await openStudio(page);
    await workspaceHeading(page).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "Back to the overview" })).toBeFocused();
    await workspaceHeading(page).focus();
    const names: string[] = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Tab");
      names.push(await page.evaluate(() => (document.activeElement?.tagName === "IFRAME" ? "studio" : (document.activeElement?.textContent ?? "").trim())));
    }
    expect(names).toEqual(["Reset", "Close", "studio"]);
    const frame = page.frames().find((f) => f.url().startsWith("http://localhost:8790/"))!;
    const onAControl = () => frame.evaluate(() => document.activeElement !== document.body);
    if (browserName === "firefox") {
      // Firefox, as for any frame: Tab stops first on the frame's document, and Shift+Tab from
      // there goes to the frame's last control, not back to the bar. Focus stays inside the studio.
      expect(await onAControl()).toBe(false);
      await page.keyboard.press("Shift+Tab");
      await expect(page.locator("iframe.studio__frame")).toBeFocused();
      expect(await onAControl()).toBe(true);
      // From the bar, Tab twice reaches the studio's first control.
      await page.getByRole("button", { name: "Close" }).focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
    }
    // Focus is now on the studio's first control; Shift+Tab leaves it again.
    expect(await onAControl()).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
  });

  test("Tab and Shift+Tab wrap between the workspace bar and the studio", async ({ page, browserName }) => {
    needsStudio();
    await openStudio(page);
    const frame = page.frames().find((f) => f.url().startsWith("http://localhost:8790/"))!;
    // From the studio's last control, Tab leaves the frame and wraps to the bar's first control.
    // In Firefox the frame takes focus first, as it would from the keyboard: Firefox does not move
    // focus into a frame that a script inside it focuses on its own.
    if (browserName === "firefox") await page.locator("iframe.studio__frame").focus();
    await frame.evaluate(() => {
      const all = [...document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((e) => e.offsetParent && !e.closest("[inert]"));
      all[all.length - 1].focus();
    });
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Back to the overview" })).toBeFocused();
    // From the bar's first control, Shift+Tab wraps back into the studio.
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("iframe.studio__frame")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(await frame.evaluate(() => document.activeElement !== document.body)).toBe(true);
  });

  test("closing from inside the studio returns focus to the card, by keyboard or browser Back", async ({ page, browserName }) => {
    needsStudio();
    await page.goto("/");
    await page.getByRole("tab", { name: "AI Automation" }).click();
    await openButton(page).click();
    await explore(page).click();
    await expect(studio(page).getByRole("heading", { level: 1, name: EXAMPLE })).toBeVisible({ timeout: 20_000 });
    await expect(dialog(page)).toHaveAccessibleDescription("Fixture mode: recorded model and tool responses. No live AI is called and nothing is sent.");
    await page.getByRole("button", { name: "Close" }).focus();
    await page.keyboard.press("Tab"); // into the studio
    await expect(page.locator("iframe.studio__frame")).toBeFocused();
    if (browserName === "firefox") {
      // Firefox stops first on the frame's document (asserted in the keyboard test); on to the first control.
      expect(await page.frames().find((f) => f.url().startsWith("http://localhost:8790/"))!.evaluate(() => document.activeElement === document.body)).toBe(true);
      await page.keyboard.press("Tab");
    }
    await page.keyboard.press("Shift+Tab"); // and out again
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/");
    await expect(openButton(page)).toBeFocused();

    await openButton(page).click();
    await explore(page).click();
    await studio(page).getByRole("tab", { name: "Design" }).focus();
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL("/");
    await expect(dialog(page)).toBeHidden();
    await expect(openButton(page)).toBeFocused();
  });

  test("when the browser blocks the studio's storage, the workspace says so", async ({ page }) => {
    needsStudio();
    // As a browser that refuses site data to embedded frames would: storage access throws.
    await page.addInitScript(() => {
      if (location.port !== "8790") return;
      for (const name of ["indexedDB", "sessionStorage"])
        Object.defineProperty(window, name, { get: () => { throw new DOMException("The operation is insecure.", "SecurityError"); } });
    });
    await page.goto(WORKSPACE);
    await expect(dialog(page).getByRole("alert")).toContainText("this browser does not let the embedded studio store data");
    await expect(dialog(page).getByRole("alert").getByRole("link", { name: "case study" })).toBeVisible();
  });

  test("when the studio's session cookie is not kept in the frame, the workspace says so instead of waiting", async ({ page }) => {
    needsStudio();
    // The gateway's /session answers false when the cookie does not come back, as in a browser that
    // drops it (site and studio on different domains, or cookies blocked). That case is exercised
    // for real, over HTTPS, by demos/aiws/check-origins.mjs; here the answer is given directly.
    await page.route("http://localhost:8790/session", (route) => route.fulfill({ json: { cookie: false } }));
    await page.goto(WORKSPACE);
    await expect(dialog(page).getByRole("alert")).toContainText("does not keep the studio’s session cookie inside this page");
  });

  test("with reduced motion each view appears in place; the studio fills the window", async ({ page }) => {
    needsStudio();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("tab", { name: "AI Automation" }).click();
    await openButton(page).click();
    const viewport = page.viewportSize()!;
    const margin = viewport.width < 640 ? 12 : 32;
    expect(Math.round((await frameBox(page)).width)).toBe(Math.min(viewport.width - 2 * margin, 880));
    await explore(page).click();
    expect(await frameBox(page)).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });
    await expect(studio(page).getByRole("heading", { level: 1, name: EXAMPLE })).toBeVisible({ timeout: 20_000 });
    const iframe = (await page.locator("iframe.studio__frame").boundingBox())!;
    expect(Math.round(iframe.width)).toBe(viewport.width);
    expect(Math.round(iframe.y + iframe.height)).toBe(viewport.height);
  });

  test("resizing keeps the studio filling the window", async ({ page }) => {
    needsStudio();
    await openStudio(page);
    await page.setViewportSize({ width: 760, height: 620 });
    await expect.poll(async () => Math.round((await page.locator("iframe.studio__frame").boundingBox())!.width)).toBe(760);
    const iframe = (await page.locator("iframe.studio__frame").boundingBox())!;
    expect(Math.round(iframe.y + iframe.height)).toBe(620);
    await expect(studio(page).getByRole("heading", { level: 1, name: EXAMPLE })).toBeVisible();
  });

  test("when the studio cannot be reached, the workspace says so and recovers on retry", async ({ page }) => {
    await page.route("http://localhost:8790/healthz", (route) => route.abort());
    await page.goto(WORKSPACE);
    const alert = dialog(page).getByRole("alert");
    await expect(alert).toContainText("AI Workflow Studio is not reachable right now.");
    await expect(alert.getByRole("link", { name: "case study" })).toHaveAttribute("href", "/projects/ai-workflow-studio/");
    if (!studioAvailable) return;
    await page.unroute("http://localhost:8790/healthz");
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(studio(page).getByRole("heading", { level: 1, name: EXAMPLE })).toBeVisible({ timeout: 20_000 });
  });

  test("when the proxy answers but the service behind it is down, the workspace says it is not reachable", async ({ page }) => {
    // As Caddy does for a stopped upstream: a response, but an error without the service's headers.
    await page.route("http://localhost:8790/healthz", (route) => route.fulfill({ status: 502, body: "" }));
    await page.goto(WORKSPACE);
    await expect(dialog(page).getByRole("alert")).toContainText("AI Workflow Studio is not reachable right now.");
  });

  test("when the example cannot be restored, the workspace says why and recovers on retry", async ({ page }) => {
    needsStudio();
    await page.route("http://localhost:8790/seed/studio.sqlite", (route) => route.fulfill({ status: 503, body: "" }));
    await page.goto(WORKSPACE);
    await expect(dialog(page).getByRole("alert")).toContainText("could not be opened: The example workspace is not available (503).");
    await page.unroute("http://localhost:8790/seed/studio.sqlite");
    await dialog(page).getByRole("button", { name: "Try again" }).click();
    await expect(studio(page).getByRole("heading", { level: 1, name: EXAMPLE })).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("the case study", () => {
  test("links into the workspace, and browser Back returns to it", async ({ page }) => {
    await page.goto("/projects/ai-workflow-studio/");
    await page.getByRole("link", { name: "Explore the workspace" }).click();
    await expect(page).toHaveURL(WORKSPACE);
    await expect(workspaceHeading(page)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL("/projects/ai-workflow-studio/");
    await expect(page.getByRole("heading", { level: 1, name: "AI Workflow Studio" })).toBeVisible();
  });

  test("stays complete without JavaScript, without workspace controls", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/projects/ai-workflow-studio/");
    await expect(page.getByRole("heading", { name: "Guardrails and human oversight" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore the workspace" })).toHaveCount(0);
    await page.goto("/");
    await expect(openButton(page)).toHaveCount(0);
    await context.close();
  });
});

test.describe("the real studio", () => {
  test.beforeEach(needsStudio);

  test("runs the example with fixtures, pauses for approval, and completes when approved", async ({ page }) => {
    await openStudio(page);
    await runToApproval(page);
    await expect(studio(page).locator('.wf-node[data-step="waiting"]')).toHaveCount(1);
    await studio(page).getByLabel("Comment (optional)").fill("Approved from the portfolio test");
    await studio(page).getByRole("button", { name: "Approve", exact: true }).click();
    await expect(runStatus(page)).toContainText("Completed (queued)", { timeout: 15_000 });
    await expect(runStatus(page)).toContainText("Fixture run");
    await expect(studio(page).getByTestId("run-output")).toContainText("out_hot-finance-ops");
  });

  test("the example is corrected for the demo: Joshua, not James", async ({ page }) => {
    await openStudio(page);
    await runToApproval(page);
    const panel = studio(page).locator("body");
    await expect(panel).toContainText("Hi Joshua,");
    await expect(studio(page).getByText(/Joshua\s*Applied Intelligence Studio/).filter({ visible: true }).first()).toBeVisible();
    await expect(panel).not.toContainText("James");
  });

  test("a rejected draft ends the run as rejected", async ({ page }) => {
    await openStudio(page);
    await runToApproval(page);
    await studio(page).getByRole("button", { name: "Reject", exact: true }).click();
    await expect(runStatus(page)).toContainText("Completed (rejected)", { timeout: 15_000 });
  });

  test("an edit in the editor changes what the runtime does", async ({ page }) => {
    await openStudio(page);
    await editStep(page, /^Score at least 60\?/);
    await studio(page).getByLabel("Label").filter({ visible: true }).fill("Score at least 95?");
    await studio(page).getByLabel("Compare with").filter({ visible: true }).fill("95");
    await expect(studio(page).getByTestId("save-status")).toContainText("Saved locally", { timeout: 8000 });
    await expect(studio(page).getByTestId("save-status").locator("..")).toContainText("Revision 2");
    await expect(studio(page).getByTestId("save-status").locator("..")).toContainText("Valid");
    const closeInspector = studio(page).getByRole("button", { name: /^Close inspector/ }).filter({ visible: true });
    if (await closeInspector.count()) {
      // Narrow layout: the drawer covers the tabs. Wait until it has closed before going on.
      await closeInspector.click();
      await expect(closeInspector).toHaveCount(0);
    }
    await studio(page).getByRole("tab", { name: "Test" }).click();
    await showTestPanel(page);
    await studio(page).getByRole("button", { name: "Run with fixtures" }).click();
    // The recorded score is 88, so the edited threshold sends the enquiry to nurture.
    await expect(runStatus(page)).toContainText("Completed (nurture)", { timeout: 15_000 });
  });

  test("live runs stay unavailable, in the studio's own words", async ({ page }) => {
    await openStudio(page);
    await showTestPanel(page);
    await studio(page).getByRole("button", { name: "Live (OpenAI)" }).click();
    await expect(studio(page).getByText("Live runs of workflows with agents need an OpenAI API key").first()).toBeVisible();
    await expect(studio(page).getByRole("button", { name: /^Run/ }).first()).toBeDisabled();
  });

  test("exports the project, whose own fixture run completes, and downloads the ZIP", async ({ page }) => {
    await openStudio(page);
    await studio(page).getByRole("tab", { name: "Export" }).click();
    await studio(page).getByRole("button", { name: "Generate project" }).click();
    await expect(studio(page).getByTestId("export-summary")).toContainText("Fixture run: completed (queued)", { timeout: 60_000 });
    const [download] = await Promise.all([page.waitForEvent("download"), studio(page).getByRole("button", { name: "Save jmb-lead-qualification.zip" }).click()]);
    expect(download.suggestedFilename()).toBe("jmb-lead-qualification.zip");
    expect(readFileSync((await download.path())!).subarray(0, 2).toString()).toBe("PK");
  });

  test("restrictions show in the studio: ZIP import refused, Python steps switched off", async ({ page }) => {
    await openStudio(page);
    const frame = page.frames().find((f) => f.url().startsWith("http://localhost:8790/"))!;
    await frame.evaluate(() => (location.hash = "#/home"));
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), studio(page).getByRole("button", { name: "Import" }).first().click()]);
    await chooser.setFiles({ name: "project.zip", mimeType: "application/zip", buffer: Buffer.from("UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==", "base64") });
    await expect(studio(page).getByText("Import failed: Importing ZIP exports is switched off in this public demo.")).toBeVisible();
    await frame.evaluate(() => (location.hash = "#/settings"));
    await expect(studio(page).getByText("Python steps are switched off in this public demo.")).toBeVisible();
  });

  test("edits stay in the browser; Reset asks first, and Cancel or Escape keeps them", async ({ page }) => {
    await openStudio(page);
    await editStep(page, /^Score at least 60\?/);
    await studio(page).getByLabel("Label").filter({ visible: true }).fill("Score at least 75?");
    await expect(revision(page)).toContainText("Revision 2", { timeout: 8000 });
    await page.reload();
    await expect(studio(page).getByRole("heading", { level: 1, name: EXAMPLE })).toBeVisible({ timeout: 20_000 });
    await expect(revision(page)).toContainText("Revision 2");

    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.getByRole("button", { name: /^Discard/ })).toBeFocused();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Reset" })).toBeFocused();
    await page.getByRole("button", { name: "Reset" }).click();
    await page.keyboard.press("Escape"); // cancels the confirmation, not the workspace
    await expect(page).toHaveURL(WORKSPACE);
    await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
    await expect(revision(page)).toContainText("Revision 2");

    await page.getByRole("button", { name: "Reset" }).click();
    await page.getByRole("button", { name: /^Discard/ }).click();
    await expect(revision(page)).toContainText("Revision 1", { timeout: 20_000 });
    await expect(page.getByText("The workspace has been reset to the example.")).toBeAttached();
  });

  test("one tab at a time: opening a second tab hands the workspace over, and no edit is lost", async ({ page, context }) => {
    const label = async (p: Page, text: string) => {
      await editStep(p, /^Score at least/);
      await studio(p).getByLabel("Label").filter({ visible: true }).fill(text);
    };
    const elsewhere = (p: Page) => dialog(p).getByText("AI Workflow Studio is open in another tab of this site.");

    await openStudio(page);
    await label(page, "Score at least 61?");
    await expect(revision(page)).toContainText("Revision 2", { timeout: 8000 });

    // A second tab opens the workspace: the first lets go of it, so it cannot write back an old copy.
    const second = await context.newPage();
    await openStudio(second);
    await expect(revision(second)).toContainText("Revision 2");
    await expect(elsewhere(page)).toBeVisible();
    await expect(page.locator("iframe.studio__frame")).toHaveCount(0);
    await label(second, "Score at least 62?");
    await expect(revision(second)).toContainText("Revision 3", { timeout: 8000 });

    // Back in the first tab, Use it here takes it over again, with the second tab's edit.
    await page.bringToFront();
    await dialog(page).getByRole("button", { name: "Use it here" }).click();
    await expect(revision(page)).toContainText("Revision 3", { timeout: 20_000 });
    await expect(elsewhere(second)).toBeVisible();
    await label(page, "Score at least 63?");
    await expect(revision(page)).toContainText("Revision 4", { timeout: 8000 });

    // A fresh tab finds every edit: nothing was overwritten.
    const third = await context.newPage();
    await openStudio(third);
    await expect(revision(third)).toContainText("Revision 4");
    await editStep(third, /^Score at least 63\?/);
    for (const p of [second, third]) await p.close();
  });

  test("Reset in one tab restores the example for the tab that takes the workspace next", async ({ page, context }) => {
    await openStudio(page);
    await editStep(page, /^Score at least 60\?/);
    await studio(page).getByLabel("Label").filter({ visible: true }).fill("Score at least 85?");
    await expect(revision(page)).toContainText("Revision 2", { timeout: 8000 });
    const second = await context.newPage();
    await openStudio(second);
    await second.getByRole("button", { name: "Reset" }).click();
    await second.getByRole("button", { name: /^Discard/ }).click();
    await expect(revision(second)).toContainText("Revision 1", { timeout: 20_000 });
    await page.bringToFront();
    await dialog(page).getByRole("button", { name: "Use it here" }).click();
    await expect(revision(page)).toContainText("Revision 1", { timeout: 20_000 });
    await second.close();
  });

  test("one visitor cannot see another visitor's runs or work", async ({ page, browser }) => {
    await openStudio(page);
    const started = page.waitForResponse((r) => r.url().endsWith("/engine/runs") && r.request().method() === "POST");
    await runToApproval(page);
    const { runId } = await (await started).json();
    const statusFrom = (p: Page, path: string, body?: unknown) =>
      p.frames().find((f) => f.url().startsWith("http://localhost:8790/"))!.evaluate(
        async ([path, body]) => (await fetch(path as string, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined)).status,
        [path, body] as const,
      );
    expect(await statusFrom(page, `/engine/runs/${runId}`)).toBe(200);

    const stranger = await (await browser.newContext()).newPage();
    await openStudio(stranger);
    expect(await statusFrom(stranger, `/engine/runs/${runId}`)).toBe(404);
    expect(await statusFrom(stranger, "/engine/resume", { checkpoint: { runId, mode: "fixture" }, decision: { approved: true } })).toBe(404);
    // The stranger's studio holds only the example, at its first revision, with no runs.
    await expect(studio(stranger).getByTestId("save-status").locator("..")).toContainText("Revision 1");
    await stranger.context().close();
    await expect(studio(page).getByRole("button", { name: "Approve", exact: true })).toBeVisible();
  });

  test("the approval can be completed with the keyboard", async ({ page }) => {
    await openStudio(page);
    await showTestPanel(page);
    await studio(page).getByRole("button", { name: "Run with fixtures" }).focus();
    await page.keyboard.press("Enter");
    const approve = studio(page).getByRole("button", { name: "Approve", exact: true });
    await expect(approve).toBeVisible({ timeout: 15_000 });
    await approve.focus();
    await page.keyboard.press("Enter");
    await expect(runStatus(page)).toContainText("Completed (queued)", { timeout: 15_000 });
  });

  test("the portfolio's own controls have no accessibility violations", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "AI Automation" }).click();
    await openButton(page).click();
    await expect(overviewHeading(page)).toBeFocused();
    await page.waitForTimeout(700); // let the expansion settle so contrast is measured at rest
    const preview = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(preview.violations.map((v) => v.id)).toEqual([]);
    await explore(page).click();
    await expect(studio(page).getByRole("heading", { level: 1, name: EXAMPLE })).toBeVisible({ timeout: 20_000 });
    // The studio has its own accessibility tests; here only the portfolio around it is checked.
    const workspace = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).exclude("iframe").analyze();
    expect(workspace.violations.map((v) => v.id)).toEqual([]);
  });
});
