import { expect, test } from "@playwright/test";
import { openAdvancedTools } from "./helpers";

test("guides a planned show through preflight and preserves entry changes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Open one show, finish every segment/ })).toBeVisible();

  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows" }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").first().fill("PWL Operations Test");
  await page.getByRole("button", { name: "Add Match" }).click();
  await page.locator('[data-segment-type="match"]').getByLabel("Segment name").fill("Jay White vs PAC");
  await expect(page.locator(".save-state")).toHaveText("Saved");
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem("tew-story-tracker:planned-shows:v1");
    const shows = raw ? JSON.parse(raw) as Array<{ name?: string }> : [];
    return shows[0]?.name ?? "";
  })).toBe("PWL Operations Test");

  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Show Operations Diagnostics", exact: true }).click();
  await expect(page.getByLabel("Operations planned show").locator("option:checked")).toContainText("PWL Operations Test");
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
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Show Operations Diagnostics", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entry Changes" })).toHaveClass(/active/);
  await expect(page.getByText("TEW broadcast timing changed on show day.", { exact: true })).toBeVisible();
});
