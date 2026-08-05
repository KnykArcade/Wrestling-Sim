import { expect, test } from "@playwright/test";
import { openAdvancedTools, openCardSegment } from "./helpers";

test("selects and persists wrestler approaches inside a planned TEW match", async ({ page }) => {
  await page.goto("/");
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows", exact: true }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL Approach Test");
  await page.getByRole("button", { name: "Add Match" }).click();

  const match = page.locator('[data-segment-type="match"]');
  await match.getByLabel("Segment name").fill("Jay White vs PAC");
  await match.getByLabel("Length (minutes)").fill("20");
  await expect(match.getByLabel("Approach limit per wrestler")).toHaveValue("3");
  await expect(match.getByText("Recommended: 3", { exact: true })).toBeVisible();
  await match.getByLabel("Approach limit per wrestler").fill("2");

  await match.getByLabel("Manual worker name").fill("Jay White");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();
  await match.getByLabel("Manual worker name").fill("PAC");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();

  await expect(match.locator(".match-competitor-card")).toHaveCount(2);
  await match.getByLabel("Match aim").selectOption("competitive-tv-match");
  await match.getByRole("button", { name: "Run AI for All Competitors" }).click();

  const jay = match.locator('[data-match-worker="manual:jay white"]');
  const pac = match.locator('[data-match-worker="manual:pac"]');
  await expect(jay.getByText("2/2 · AI", { exact: true })).toBeVisible();
  await expect(pac.getByText("2/2 · AI", { exact: true })).toBeVisible();
  await expect(jay.locator(".selected-approach-row")).toHaveCount(2);
  await expect(pac.locator(".selected-approach-row")).toHaveCount(2);
  await expect(jay.getByText(/stamina/).first()).toBeVisible();

  const lockedName = await jay.locator(".selected-approach-row strong").first().textContent();
  await jay.locator(".approach-lock input").first().check();
  await match.getByLabel("Match aim").selectOption("technical-showcase");
  await jay.getByRole("button", { name: "Run Approach AI" }).click();
  await expect(jay.locator(".selected-approach-row strong").filter({ hasText: lockedName ?? "" })).toBeVisible();

  await page.reload();
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows", exact: true }).click();
  await openCardSegment(page, "Jay White vs PAC");
  const persistedMatch = page.locator('[data-segment-type="match"]');
  await expect(page.getByLabel("Show name")).toHaveValue("PWL Approach Test");
  await expect(persistedMatch.getByLabel("Match aim")).toHaveValue("technical-showcase");
  await expect(persistedMatch.getByLabel("Approach limit per wrestler")).toHaveValue("2");
  await expect(persistedMatch.locator(".match-competitor-card")).toHaveCount(2);
  await expect(persistedMatch.locator('[data-match-worker="manual:jay white"] .selected-approach-row')).toHaveCount(2);
  await expect(persistedMatch.locator('[data-match-worker="manual:jay white"] .approach-lock input:checked')).toHaveCount(1);
});
