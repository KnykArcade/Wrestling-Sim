import { expect, test } from "@playwright/test";
import { openAdvancedTools } from "./helpers";

test("generates and persists a TEW-authoritative match performance preview", async ({ page }) => {
  await page.goto("/");
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows" }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL Performance Preview");
  await page.getByRole("button", { name: "Add Match" }).click();

  const match = page.locator('[data-segment-type="match"]');
  await match.getByLabel("Segment name").fill("Jay White vs PAC");
  await match.getByLabel("Length (minutes)").fill("20");
  await match.getByLabel("Manual worker name").fill("Jay White");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();
  await match.getByLabel("Manual worker name").fill("PAC");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();
  await match.getByLabel("Match aim").selectOption("competitive-tv-match");
  await match.getByRole("button", { name: "Run AI for All Competitors" }).click();

  await expect(match.getByLabel("Performance preview authority")).toHaveValue("tew-authoritative");
  await match.getByRole("button", { name: "Roll New Night" }).click();
  await expect(match.getByText("Determined in TEW", { exact: true })).toBeVisible();
  await expect(match.getByText("Tracker preview only", { exact: true })).toBeVisible();
  await expect(match.locator(".match-performance-worker")).toHaveCount(2);
  await expect(match.locator(".match-performance-scorecard strong").first()).not.toHaveText("0.0");
  const savedScore = await match.locator(".match-performance-scorecard strong").first().textContent();
  const savedSeed = await match.locator(".match-performance-seed span").first().textContent();

  await page.reload();
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows" }).click();
  const persistedMatch = page.locator('[data-segment-type="match"]');
  await expect(page.getByLabel("Show name")).toHaveValue("PWL Performance Preview");
  await expect(persistedMatch.getByText("Determined in TEW", { exact: true })).toBeVisible();
  await expect(persistedMatch.locator(".match-performance-scorecard strong").first()).toHaveText(savedScore ?? "");
  await expect(persistedMatch.locator(".match-performance-seed span").first()).toHaveText(savedSeed ?? "");

  await persistedMatch.getByLabel("Performance preview authority").selectOption("competitive-preview");
  await persistedMatch.getByRole("button", { name: "Roll New Night" }).click();
  await expect(persistedMatch.getByText("Optional competitive preview", { exact: true })).toBeVisible();
  await expect(persistedMatch.getByText(/advisory confidence/)).toBeVisible();
  await expect(persistedMatch.getByText(/Win chance/)).toHaveCount(2);
  await expect(persistedMatch.getByText(/does not change the planned winner or TEW result/)).toBeVisible();
});
