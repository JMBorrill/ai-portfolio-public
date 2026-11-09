import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Criteria Chat's Living Project: the app on its fictional, approved dataset inside the workspace,
// served by demos/criteria (CRITERIA_SITE; see playwright.config.ts). The site must be built with
// NEXT_PUBLIC_CRITERIA_SITE_URL=http://localhost:8777.

const needsSite = () => test.skip(!process.env.CRITERIA_SITE, "Needs the Criteria Chat build (set CRITERIA_SITE).");

const site = (page: Page) => page.frameLocator('iframe[title^="Criteria Chat"]');

test("card → workspace answers a question with quoted, cited policy, and Close returns to the card", async ({ page }) => {
  needsSite();
  await page.goto("/");
  await page.getByRole("tab", { name: "Lending Criteria AI" }).click();
  const open = page.getByRole("button", { name: /^Open the project.*Criteria Chat$/ });
  await open.click();
  const dialog = page.getByRole("dialog", { name: /Criteria Chat/ });
  await dialog.getByRole("button", { name: /Explore/ }).first().click();

  await expect(site(page).getByText("Fictional demo data").first()).toBeVisible({ timeout: 30_000 });
  await site(page).getByRole("button", { name: /Compare CCJ policy/ }).click();
  await expect(site(page).getByText("CCJs registered in the last 12 months are not accepted.")).toBeVisible({ timeout: 15_000 });
  await expect(site(page).getByRole("button", { name: "View source" }).first()).toBeVisible();
  await expect(site(page).getByText(/withheld/i)).toHaveCount(0);

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(open).toBeFocused();
});

test("the preview has no accessibility violations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#criteria-chat");
  await expect(page.getByRole("dialog", { name: /Criteria Chat/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
});
