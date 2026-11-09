import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;
// A tab in the main row (inner rows of grouped projects are tabs too).
const tab = (page: Page, name: string | RegExp) => page.getByRole("tablist", { name: "Projects", exact: true }).getByRole("tab", { name });
const RESEARCH = /^Research/;

test.describe("the project list", () => {
  test("lists every project, and shows the one chosen", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("tablist", { name: "Projects", exact: true }).getByRole("tab")).toHaveText([
      /^Research\s*3, 3 projects$/,
      "AI Automation",
      /^Client Delivery\s*2, 2 projects$/,
      "Lending Criteria AI",
    ]);
    const panel = page.getByRole("tabpanel").first();
    await expect(panel.getByRole("heading", { name: "Backtesting Platform" })).toBeVisible();

    await tab(page, "Lending Criteria AI").click();
    await expect(tab(page, "Lending Criteria AI")).toHaveAttribute("aria-selected", "true");
    await expect(panel.getByRole("heading", { name: "Criteria Chat" })).toBeVisible();
    await expect(panel.getByRole("link", { name: /^View on GitHub/ })).toHaveAttribute("href", "https://github.com/JMBorrill/criteria-chat-public");

    // A card's actions: open the demo, or go to its source. The case study is linked from the demo's preview.
    await tab(page, RESEARCH).click();
    await expect(panel.getByRole("button", { name: /^Open the project/ })).toBeVisible();
    await expect(panel.getByRole("link", { name: /^View on GitHub/ })).toHaveAttribute("href", "https://github.com/JMBorrill/quant-research-studio-public");
    await expect(panel.getByRole("link", { name: /case study/ })).toHaveCount(0);

    // Client repositories hold client material: no source link.
    await tab(page, /^Client Delivery/).click();
    await expect(page.getByRole("tabpanel").first().getByRole("link", { name: /^View on GitHub/ })).toHaveCount(0);
  });

  test("without JavaScript, a flagship card links to its case study instead of a demo", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("link", { name: /^Read the case study.*Backtesting Platform$/ })).toHaveAttribute("href", "/projects/quant-research-studio/");
    await context.close();
  });

  test("works from the keyboard", async ({ page }) => {
    await page.goto("/");
    await tab(page, RESEARCH).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "AI Automation")).toBeFocused();
    await expect(tab(page, "AI Automation")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(tab(page, "Lending Criteria AI")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(tab(page, RESEARCH)).toBeFocused();
    await page.keyboard.press("End");
    await expect(tab(page, "Lending Criteria AI")).toHaveAttribute("aria-selected", "true");
  });

  test("a link to a project selects its group and the project within it, and closing returns to its card", async ({ page }) => {
    await page.goto("/#quant-research-studio");
    await expect(tab(page, RESEARCH)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Backtesting Platform" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("dialog", { name: /Backtesting Platform/ }).getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 3, name: "Backtesting Platform" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Open the project.*Backtesting Platform$/ })).toBeFocused();
  });

  test("the hero opens its demo in place, shows that project's card behind it, and Close returns to the hero", async ({ page }) => {
    await page.goto("/");
    const cta = page.getByRole("link", { name: "Try AI Workflow Studio" });
    await cta.click();
    await expect(page).toHaveURL(/#ai-workflow-studio$/);
    const dialog = page.getByRole("dialog", { name: /AI Workflow Studio/ });
    await expect(dialog).toBeVisible();
    await expect(tab(page, "AI Automation")).toHaveAttribute("aria-selected", "true");
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(cta).toBeFocused();
  });

  test("research shows that it holds three projects, and switches between them", async ({ page }) => {
    await page.goto("/");
    await expect(tab(page, RESEARCH)).toContainText("3");
    const inner = page.getByRole("tablist", { name: "Research projects" }).getByRole("tab");
    await expect(inner).toHaveText(["Backtesting Platform", "Satellite Intelligence Lab", "Small Model Training"]);
    await expect(page.getByRole("heading", { level: 3, name: "Backtesting Platform" })).toBeVisible();
    await inner.nth(1).click();
    await expect(page.getByRole("heading", { level: 3, name: "Satellite Intelligence Lab" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Backtesting Platform" })).toBeHidden();
  });

  test("client delivery shows that it holds two projects, and switches between them", async ({ page }) => {
    await page.goto("/");
    await expect(tab(page, /^Client Delivery/)).toContainText("2");
    await tab(page, /^Client Delivery/).click();
    const inner = page.getByRole("tablist", { name: "Client projects" }).getByRole("tab");
    await expect(inner).toHaveText(["Charity Digital Transformation", "Schools League Platform"]);
    await expect(page.getByRole("heading", { level: 3, name: "Charity Digital Transformation" })).toBeVisible();
    await inner.nth(1).click();
    await expect(page.getByRole("heading", { level: 3, name: "Schools League Platform" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Charity Digital Transformation" })).toBeHidden();
  });

  test("a link to a client project selects client delivery, and that project within it", async ({ page }) => {
    await page.goto("/#charity-website");
    await expect(tab(page, /^Client Delivery/)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Charity Digital Transformation" })).toHaveAttribute("aria-selected", "true");
  });

  test("without JavaScript, every project reads in order", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.locator(".flagship__title")).toHaveCount(7);
    for (const title of await page.locator(".flagship__title").all()) await expect(title).toBeVisible();
    await context.close();
  });

  test("has no accessibility violations on either kind of card", async ({ page }) => {
    // Without the fade: a scan part-way through it would measure the text at part opacity.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole("tab", { name: "Small Model Training" }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

// Every page fits the narrowest common phone without scrolling sideways (WCAG 1.4.10 reflow).
for (const path of ["/", "/projects/ai-workflow-studio/", "/projects/quant-research-studio/"]) {
  test(`${path} does not scroll sideways at 320 pixels`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(path);
    const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(scroll).toBeLessThanOrEqual(client);
  });
}

test("Get in touch, in the header and at the foot of the page, opens an email", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Get in touch" })).toHaveAttribute("href", "mailto:jmborrill@outlook.com");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: /^Email me/ })).toHaveAttribute("href", "mailto:jmborrill@outlook.com");
});
