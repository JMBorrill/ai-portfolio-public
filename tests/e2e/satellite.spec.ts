import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The Satellite Intelligence Lab workspace: a viewer built into the site (no demo service).

const INVESTIGATIONS = ["Industrial construction", "Mining", "Ports", "Energy"];

test("card → preview → workspace has a section per investigation, each comparing its site's two years", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /^Research/ }).click();
  await page.getByRole("tab", { name: "Satellite Intelligence Lab" }).click();
  const open = page.getByRole("button", { name: /^Open the project.*Satellite Intelligence Lab$/ });
  await open.click();
  const dialog = page.getByRole("dialog", { name: /Satellite Intelligence Lab/ });
  await dialog.getByRole("button", { name: /Explore/ }).first().click();
  await expect(page).toHaveURL(/#satellite-intelligence-lab\/workspace$/);

  await expect(dialog.getByRole("navigation", { name: "Investigations" }).getByRole("link")).toHaveText(INVESTIGATIONS);
  for (const title of INVESTIGATIONS) {
    const section = dialog.getByRole("region", { name: title, exact: true });
    // The contents link scrolls the workspace to the section and leaves the URL alone.
    await dialog.getByRole("navigation", { name: "Investigations" }).getByRole("link", { name: title }).click();
    await expect(section.getByRole("heading", { level: 3 })).toBeInViewport();
    await expect(page).toHaveURL(/#satellite-intelligence-lab\/workspace$/);
    await expect(section.getByRole("heading", { name: "Hypotheses" })).toBeVisible();

    const images = section.locator(".sat__figure img");
    await expect(images).toHaveCount(2);
    for (const img of await images.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect(img).toHaveAttribute("alt", /, \d{4}-\d{2}-\d{2}: .+/);
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(600);
    }
    await expect(section.locator(".sat__outline")).toHaveCount(2);
    await expect(section.getByRole("table")).toContainText("Vegetation");
  }
  await expect(dialog).toContainText("Contains modified Copernicus Sentinel data");

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(open).toBeFocused();
});

test("the workspace has no accessibility violations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#satellite-intelligence-lab/workspace");
  await expect(page.locator(".sat__figure img").first()).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
});
