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
  await match.getByLabel("Segment name").fill("Manual match title");
  await match.getByLabel("Length (minutes)").fill("20");
  await expect(match.getByLabel("Approach limit per wrestler")).toHaveValue("3");
  await expect(match.getByLabel("Approach limit per wrestler")).toHaveAttribute("max", "4");
  await expect(match.getByText("Recommended: 3", { exact: true })).toBeVisible();
  const aimWidth = (await match.locator(".match-setting-aim").boundingBox())?.width ?? 0;
  const approachesWidth = (await match.locator(".match-setting-limit").boundingBox())?.width ?? 0;
  expect(aimWidth).toBeLessThan(approachesWidth);
  await match.getByLabel("Approach limit per wrestler").fill("8");
  await expect(match.getByLabel("Approach limit per wrestler")).toHaveValue("4");
  await match.getByLabel("Approach limit per wrestler").fill("2");

  await match.getByLabel("Manual worker name").fill("Jay White");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();
  await match.getByLabel("Manual worker name").fill("PAC");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();
  await match.getByRole("button", { name: "Auto-Name Match" }).click();
  await expect(match.getByLabel("Segment name")).toHaveValue("Jay White vs PAC");

  await expect(match.locator(".tew-strategy-row")).toHaveCount(2);
  await match.getByLabel("Match aim").selectOption("competitive-tv-match");
  await match.getByRole("button", { name: "Run AI for All Competitors" }).click();

  const jay = match.locator('[data-match-worker="manual:jay white"]');
  const pac = match.locator('[data-match-worker="manual:pac"]');
  await expect(jay.getByRole("button", { name: "Jay White approach 1" })).toContainText(/Cost \d+ · Pace \d+/);
  await expect(pac.getByRole("button", { name: "PAC approach 1" })).toContainText(/Cost \d+ · Pace \d+/);
  await expect(jay.locator(".tew-strategy-result")).toContainText(/Pace \d+ ·/);

  const lockedName = await jay.getByRole("button", { name: "Jay White approach 1" }).locator("span").textContent() ?? "";
  await jay.getByRole("button", { name: `Lock ${lockedName} for Jay White` }).click();
  await match.getByLabel("Match aim").selectOption("technical-showcase");
  await jay.getByRole("button", { name: "Run Approach AI for Jay White" }).click();
  await expect(jay.getByRole("button", { name: "Jay White approach 1" })).toContainText(lockedName ?? "");
  await expect(jay.getByRole("button", { name: `Unlock ${lockedName} for Jay White` })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows", exact: true }).click();
  await openCardSegment(page, "Jay White vs PAC");
  const persistedMatch = page.locator('[data-segment-type="match"]');
  await expect(page.getByLabel("Show name")).toHaveValue("PWL Approach Test");
  await expect(persistedMatch.getByLabel("Match aim")).toHaveValue("technical-showcase");
  await expect(persistedMatch.getByLabel("Approach limit per wrestler")).toHaveValue("2");
  await expect(persistedMatch.locator(".tew-strategy-row")).toHaveCount(2);
  await expect(persistedMatch.locator('[data-match-worker="manual:jay white"] .approach-slot-trigger--strong, [data-match-worker="manual:jay white"] .approach-slot-trigger--balanced, [data-match-worker="manual:jay white"] .approach-slot-trigger--risk')).toHaveCount(2);
  await expect(persistedMatch.locator('[data-match-worker="manual:jay white"] .approach-slot-lock--active')).toHaveCount(1);
});
