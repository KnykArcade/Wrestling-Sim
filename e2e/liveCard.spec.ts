import { expect, test } from "@playwright/test";
import { openAdvancedTools } from "./helpers";

async function addManualSinglesMatch(page: import("@playwright/test").Page, title: string, first: string, second: string) {
  await page.getByRole("button", { name: "Add Match" }).click();
  const match = page.locator('[data-segment-type="match"]').last();
  await match.getByLabel("Segment name").fill(title);
  await match.getByLabel("Length (minutes)").fill("18");
  await match.getByLabel("Manual worker name").fill(first);
  await match.getByRole("button", { name: "Add Manual Worker" }).click();
  await match.getByLabel("Manual worker name").fill(second);
  await match.getByRole("button", { name: "Add Manual Worker" }).click();
  await match.getByRole("button", { name: "Run AI for All Competitors" }).click();
  return match;
}

test("runs a show one result at a time and inserts a grounded reaction angle", async ({ page }) => {
  await page.goto("/");
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows", exact: true }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL Live Card Test");
  const firstMatch = await addManualSinglesMatch(page, "Jay White vs PAC", "Jay White", "PAC");
  await page.getByRole("button", { name: "Add Angle" }).click();
  const plannedAngle = page.locator('[data-segment-type="angle"]').last();
  await plannedAngle.getByLabel("Segment name").fill("Commissioner Update");
  await plannedAngle.getByLabel("Full Segment Output").fill("The commissioner reviews the opening result and confirms the main event remains scheduled.");
  await addManualSinglesMatch(page, "Brian Cage vs Bobby Lashley", "Brian Cage", "Bobby Lashley");
  await expect(firstMatch.getByLabel("Planned winner")).toHaveValue("");
  await expect(page.locator(".save-state")).toHaveText("Saved");

  await page.getByRole("button", { name: "Run Show", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Run the show one segment at a time/ })).toBeVisible();
  await expect(page.getByLabel("Live card planned show").locator("option:checked")).toContainText("PWL Live Card Test");
  await page.getByRole("button", { name: "Start Live Show" }).click();
  await expect(page.locator(".live-card-current-header").getByRole("heading", { name: "Jay White vs PAC" })).toBeVisible();
  await expect(page.locator(".live-card-status-badge")).toHaveText("Result Pending");

  await page.getByRole("button", { name: "Run This Match" }).click();
  await expect(page.getByRole("heading", { name: /You book the opportunity. The wrestlers create the outcome/ })).toBeVisible();
  await expect(page.getByLabel("Resolution planned match").locator("option:checked")).toContainText("Jay White vs PAC");
  await page.getByRole("button", { name: "Run Official Match Calculation" }).click();
  await expect(page.locator(".match-resolution-result").getByText("OFFICIAL ENGINE RESULT", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Accept Engine Result" }).click();
  await expect(page.getByRole("heading", { name: /Run the show one segment at a time/ })).toBeVisible();
  const acceptedWinner = await page.locator(".live-card-match-panel h3").textContent();
  expect(acceptedWinner).toMatch(/defeated/);
  await expect(page.locator(".live-card-current-header").getByRole("heading", { name: "Jay White vs PAC" })).toBeVisible();
  await page.getByRole("button", { name: "Lock Result Into Live Card" }).click();
  await expect(page.getByText("Result locked and consequences recorded once")).toBeVisible();
  await expect(page.getByRole("heading", { name: "What happens because of this result?" })).toBeVisible();
  await expect(page.locator(".live-card-grounded-facts")).toContainText(/defeated/);
  await expect(page.getByLabel("Live card inserted angle title")).toHaveValue(/Post-Match Reaction/);
  await page.getByLabel("Live card inserted angle title").fill("Immediate Post-Match Reaction");
  await page.getByLabel("Live card inserted angle purpose").fill("Show the winner celebrating while the loser responds to the official result.");
  await page.getByRole("button", { name: "Insert After This Match" }).click();

  await expect(page.locator(".live-card-current-header").getByRole("heading", { name: "Immediate Post-Match Reaction" })).toBeVisible();
  await expect(page.locator(".live-card-grounded-facts")).toContainText(acceptedWinner?.split(" defeated ")[0] ?? "");
  await expect(page.getByLabel("Live card final angle output")).toHaveValue("");
  await page.getByLabel("Live card final angle output").fill("The winner celebrates the result. The loser acknowledges the loss but refuses to let it end the rivalry.");
  await page.getByLabel("Live card angle consequences").fill("The rivalry remains active because the loser disputes what the result means for the future.");
  await page.getByLabel("Live card angle follow up").fill("Review a rematch only if the rankings and next results support it.");
  await page.getByRole("button", { name: "Complete Angle" }).click();
  await expect(page.locator(".live-card-status-badge")).toHaveText("Completed");

  await page.getByRole("button", { name: "Next Match" }).first().click();
  await expect(page.locator(".live-card-current-header").getByRole("heading", { name: "Brian Cage vs Bobby Lashley" })).toBeVisible();
  await expect(page.locator(".live-card-status-badge")).toHaveText("Result Pending");
  await expect(page.getByRole("button", { name: "Run This Match" })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Run Show", exact: true }).click();
  await expect(page.getByLabel("Live card planned show").locator("option:checked")).toContainText("PWL Live Card Test");
  await expect(page.locator(".live-card-current-header").getByRole("heading", { name: "Brian Cage vs Bobby Lashley" })).toBeVisible();
  await expect(page.locator(".live-card-running-order button").filter({ hasText: "Immediate Post-Match Reaction" })).toContainText("Completed");

  const state = await page.evaluate(() => {
    const raw = window.localStorage.getItem("wrestling-sim:live-card:v1");
    const showsRaw = window.localStorage.getItem("tew-story-tracker:planned-shows:v1");
    return {
      live: raw ? JSON.parse(raw) as { sessions?: Array<{ currentSegmentId?: string; progress?: Array<{ title?: string; status?: string; insertedDuringShow?: boolean }> }> } : {},
      shows: showsRaw ? JSON.parse(showsRaw) as Array<{ name?: string; segments?: Array<{ title?: string; segmentOutput?: string }> }> : [],
    };
  });
  expect(state.live.sessions).toHaveLength(1);
  expect(state.live.sessions?.[0]?.progress?.find((item) => item.title === "Immediate Post-Match Reaction")).toMatchObject({ status: "Completed", insertedDuringShow: true });
  expect(state.shows[0]?.segments?.find((segment) => segment.title === "Immediate Post-Match Reaction")?.segmentOutput).toContain("winner celebrates");
});
