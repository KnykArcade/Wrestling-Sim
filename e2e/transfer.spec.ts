import { expect, test } from "@playwright/test";
import { openAdvancedTools } from "./helpers";

test("generates and persists an assisted TEW transfer package", async ({ page }) => {
  await page.goto("/");
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows" }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL Transfer Test");
  await page.getByRole("button", { name: "Add Match" }).click();
  await page.getByRole("button", { name: "Add Angle" }).click();

  const match = page.locator('[data-segment-type="match"]');
  const angle = page.locator('[data-segment-type="angle"]');
  await match.getByLabel("Segment name").fill("Jay White vs PAC");
  await match.getByLabel("Planned winner").fill("Jay White");
  await match.getByLabel("Planned finish").fill("Pinfall after Blade Runner");
  await match.getByLabel("Full match story").fill("PAC controls the pace before White creates the decisive opening.");
  await match.getByLabel("Manual worker name").fill("Jay White");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();
  await angle.getByLabel("Segment name").fill("Post-Match Confrontation");
  await angle.getByLabel("Full Segment Output").fill("The next challenger confronts the winner without physical contact.");
  await expect(page.locator(".save-state")).toHaveText("Saved");

  await page.getByRole("button", { name: "TEW Entry", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Translate the tracker card into TEW entry order/ })).toBeVisible();
  await page.getByRole("button", { name: "Generate Transfer Package" }).click();
  await expect(page.getByRole("heading", { name: "1. Event Information" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Jay White vs PAC/ })).toBeVisible();
  await expect(page.getByText("PAC controls the pace before White creates the decisive opening.", { exact: false })).toBeVisible();
  await expect(page.getByText("Database writing").first()).toBeVisible();

  await page.getByRole("button", { name: "Mark Segment Entered" }).click();
  const enteredSummary = page.locator(".transfer-score-strip > div").filter({ hasText: "Entered" });
  await expect(enteredSummary.getByText("1", { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "TEW Entry", exact: true }).click();
  await expect(page.getByRole("button", { name: "Regenerate Package" })).toBeVisible();
  await expect(page.getByText("Jay White vs PAC", { exact: true }).first()).toBeVisible();
});
