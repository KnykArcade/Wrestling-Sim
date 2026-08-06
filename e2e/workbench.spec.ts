import { expect, test } from "@playwright/test";

test("creates and persists a Quick Match output revision in Companion Core", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Match & Angle Workbench" })).toBeVisible();
  await page.getByRole("button", { name: "Match & Angle Workbench" }).click();
  await expect(page.getByRole("heading", { name: "Match approaches and segment outputs without rebuilding the whole game" })).toBeVisible();

  await page.getByLabel("Workbench template").selectOption("technical-showcase");
  await page.getByLabel("Workbench segment name").fill("Manual quick-match title");
  await page.getByLabel("Quick manual worker name").fill("Jay White");
  await page.getByRole("button", { name: "Add Manual Worker" }).click();
  await page.getByLabel("Quick manual worker name").fill("PAC");
  await page.getByRole("button", { name: "Add Manual Worker" }).click();
  await page.getByRole("button", { name: "Auto-Name Match" }).click();
  await expect(page.getByLabel("Workbench segment name")).toHaveValue("Jay White vs PAC");
  await page.getByLabel("Workbench planned winner").fill("Jay White");
  await page.getByLabel("Workbench planned finish").fill("Blade Runner after a counter");
  await page.getByLabel("Workbench current output").fill("PAC controls the pace before White creates the decisive opening and finishes with Blade Runner.");
  await page.getByLabel("Workbench key moments").fill("Opening: PAC controls pace.\nFinish: White counters into Blade Runner.");
  await page.getByLabel("Revision label").fill("Sports pass");
  await page.getByRole("button", { name: "Save Output Revision" }).click();
  await expect(page.getByText("Sports pass", { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Match & Angle Workbench" }).click();
  await expect(page.getByLabel("Workbench segment name")).toHaveValue("Jay White vs PAC");
  await expect(page.getByLabel("Workbench current output")).toContainText("PAC controls the pace");
  await expect(page.getByText("Sports pass", { exact: true })).toBeVisible();
});

test("keeps Advanced Tools hidden until explicitly opened", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Show Advanced Tools" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Planned Shows", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Show Advanced Tools" }).click();
  await page.locator("details.advanced-tools-menu summary").click();
  await expect(page.getByRole("button", { name: "Planned Shows", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Hide Advanced Tools" })).toBeVisible();
});
