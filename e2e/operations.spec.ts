import { expect, test } from "@playwright/test";

test("guides a planned show through preflight and preserves entry changes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /One show\. One operational path/ })).toBeVisible();

  await page.getByRole("button", { name: "Planned Shows" }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").first().fill("PWL Operations Test");
  await page.getByRole("button", { name: "Add Match" }).click();
  await page.locator('[data-segment-type="match"]').getByLabel("Segment name").fill("Jay White vs PAC");

  await page.getByRole("button", { name: "Show Operations" }).click();
  await expect(page.getByText("PWL Operations Test", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Card Preflight" }).click();
  await expect(page.getByRole("heading", { name: "PWL Operations Test" })).toBeVisible();
  await expect(page.locator(".operations-severity--blocking").first()).toBeVisible();
  await page.locator(".operations-issue-list article").first().getByRole("checkbox").check();
  await expect(page.locator(".operations-issue-list article.acknowledged").first()).toBeVisible();

  await page.getByRole("button", { name: "Entry Changes" }).click();
  await page.getByLabel("Changed field").fill("Duration");
  await page.getByLabel("TEW entry change reason").fill("TEW broadcast timing changed on show day.");
  await page.getByRole("button", { name: "Record Entry Change" }).click();
  await expect(page.getByText("TEW broadcast timing changed on show day.", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Entry Changes" })).toHaveClass(/active/);
  await expect(page.getByText("TEW broadcast timing changed on show day.", { exact: true })).toBeVisible();
});
