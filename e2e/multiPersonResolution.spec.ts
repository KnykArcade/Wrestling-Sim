import { expect, test } from "@playwright/test";
import { openAdvancedTools } from "./helpers";

test("resolves a tag match as teams and preserves the deciding fall", async ({ page }) => {
  await page.goto("/");
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows", exact: true }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL Phase 6B4 Test");
  await page.getByRole("button", { name: "Add Match" }).click();

  const match = page.locator('[data-segment-type="match"]').first();
  await match.getByLabel("Segment name").fill("MCMG vs Aussie Open");
  await match.getByLabel("Match format").selectOption("Tag Team");
  for (const name of ["Alex Shelley", "Chris Sabin", "Mark Davis", "Kyle Fletcher"]) {
    await match.getByLabel("Manual worker name").fill(name);
    await match.getByRole("button", { name: "Add Manual Worker" }).click();
  }
  const sides = match.getByLabel("Side / team");
  await sides.nth(0).fill("MCMG");
  await sides.nth(1).fill("MCMG");
  await sides.nth(2).fill("Aussie Open");
  await sides.nth(3).fill("Aussie Open");
  await match.getByRole("button", { name: "Run AI for All Competitors" }).click();
  await expect(match.locator(".match-competitor-card")).toHaveCount(4);

  await page.getByRole("button", { name: "Run Matches", exact: true }).click();
  await expect(page.getByText("PHASE 6B4 · TEAM AND MULTI-PERSON MATCH RESOLUTION", { exact: true })).toBeVisible();
  await expect(page.getByText("Team", { exact: true })).toBeVisible();
  await expect(page.locator(".match-resolution-worker-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Run Official Match Calculation" }).click();
  await expect(page.locator(".match-resolution-result > header h2")).toContainText("defeated");
  await expect(page.locator(".match-resolution-result")).toContainText("won when");
  await page.getByRole("button", { name: "Accept Engine Result" }).click();

  const stored = await page.evaluate(() => {
    const raw = window.localStorage.getItem("wrestling-sim:match-resolution:v1");
    return raw ? JSON.parse(raw) as { records?: Array<{ attempts?: Array<{ finalResult?: { winnerMemberKeys?: string[]; loserKeys?: string[]; fallWinnerName?: string; fallLoserName?: string } }> }> } : {};
  });
  const final = stored.records?.[0]?.attempts?.[0]?.finalResult;
  expect(final?.winnerMemberKeys).toHaveLength(2);
  expect(final?.loserKeys).toHaveLength(2);
  expect(final?.fallWinnerName).toBeTruthy();
  expect(final?.fallLoserName).toBeTruthy();
});
