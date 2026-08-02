import { expect, test } from "@playwright/test";
import { openAdvancedTools } from "./helpers";

test("uses TEW Companion Mode and persists a verified field mapping", async ({ page }) => {
  await page.goto("/");
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "TEW Companion Research", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Plan here. Run the show in TEW. Reconcile the real result." })).toBeVisible();
  await expect(page.getByText("Direct TEW writing").first()).toBeVisible();
  await expect(page.getByText("Disabled", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Show advanced preview tools").check();
  await page.getByRole("button", { name: "Field Mappings" }).click();
  const showNameMapping = page.locator(".bridge-mapping-row").filter({ hasText: "Show name" }).first();
  await showNameMapping.getByLabel("Show name TEW table").fill("tblShows");
  await showNameMapping.getByLabel("Show name TEW field").fill("Name");
  await showNameMapping.getByLabel("Show name mapping status").selectOption("Verified");
  await showNameMapping.getByLabel("Show name confidence").selectOption("High");

  await page.reload();
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "TEW Companion Research", exact: true }).click();
  await expect(page.getByLabel("Show advanced preview tools")).toBeChecked();
  await page.getByRole("button", { name: "Field Mappings" }).click();
  const persisted = page.locator(".bridge-mapping-row").filter({ hasText: "Show name" }).first();
  await expect(persisted.getByLabel("Show name TEW table")).toHaveValue("tblShows");
  await expect(persisted.getByLabel("Show name TEW field")).toHaveValue("Name");
  await expect(persisted.getByLabel("Show name mapping status")).toHaveValue("Verified");
});

test("shows the guided TEW workflow and non-writing dry-run for a planned card", async ({ page }) => {
  await page.goto("/");
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows" }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL Companion Night");
  await page.getByLabel("Company").fill("PWL");
  await page.getByLabel("Venue / location").fill("PWL Arena");
  await page.getByRole("button", { name: "Add Match" }).click();
  const match = page.locator('[data-segment-type="match"]').first();
  await match.getByLabel("Segment name").fill("Jay White vs PAC");
  await expect(page.locator(".save-state")).toHaveText("Saved");

  await openAdvancedTools(page);
  await page.getByRole("button", { name: "TEW Companion Research", exact: true }).click();
  await expect(page.getByRole("heading", { name: "PWL Companion Night" })).toBeVisible();
  await expect(page.getByText("Plan the card", { exact: true })).toBeVisible();
  await expect(page.getByText("TEW remains authoritative for actual results and ratings.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Dry-Run Package" }).click();
  await expect(page.getByRole("heading", { name: "PWL Companion Night" })).toBeVisible();
  await expect(page.getByText("Writing enabled").first()).toBeVisible();
  await expect(page.getByText("No", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".bridge-dry-run-list article")).not.toHaveCount(0);
});
