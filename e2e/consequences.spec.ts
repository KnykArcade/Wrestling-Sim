import { expect, test } from "@playwright/test";
import { openAdvancedTools } from "./helpers";

test("applies one official result to records and forces a future booking review", async ({ page }) => {
  await page.goto("/");
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows", exact: true }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL Consequence Test");
  await page.getByLabel("Date", { exact: true }).fill("2019-01-08");
  await page.getByRole("button", { name: "Add Match" }).click();

  const match = page.locator('[data-segment-type="match"]').first();
  await match.getByLabel("Segment name").fill("Jay White vs PAC");
  await match.getByLabel("Length (minutes)").fill("18");
  await match.getByLabel("Manual worker name").fill("Jay White");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();
  await match.getByLabel("Manual worker name").fill("PAC");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();
  await match.getByRole("button", { name: "Run AI for All Competitors" }).click();
  await expect(page.locator(".save-state")).toHaveText("Saved");

  await page.evaluate(() => {
    const raw = window.localStorage.getItem("tew-story-tracker:planned-shows:v1");
    const shows = raw ? JSON.parse(raw) as Array<Record<string, unknown> & { id: string; segments: Array<Record<string, unknown> & { id: string }> }> : [];
    const current = shows[0];
    if (!current) throw new Error("Current show was not saved.");
    const sourceMatch = current.segments[0];
    const timestamp = new Date().toISOString();
    shows.push({
      ...structuredClone(current),
      id: "future-consequence-show",
      name: "PWL Power Hour #2",
      date: "2019-01-15",
      status: "Draft",
      reconciliation: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      segments: [{
        ...structuredClone(sourceMatch),
        id: "future-consequence-match",
        title: "Jay White vs PAC II",
        plannedWinner: "",
        plannedFinish: "",
        workflowStatus: "Planned",
        reconciliation: {
          linkedMatchId: "",
          actualMatch: null,
          happenedAsPlanned: null,
          happenedAsPlannedDetail: "Unresolved",
          actualRating: null,
          finalNarrative: "",
          changes: "",
          actualConsequences: "",
          finalFollowUp: "",
          reconciledAt: "",
        },
      }],
    });
    window.localStorage.setItem("tew-story-tracker:planned-shows:v1", JSON.stringify(shows));
  });

  await page.getByRole("button", { name: "Run Matches", exact: true }).click();
  await expect(page.getByLabel("Resolution planned show").locator("option:checked")).toContainText("PWL Consequence Test");
  await page.getByRole("button", { name: "Run Official Match Calculation" }).click();
  await page.getByRole("button", { name: "Accept Engine Result" }).click();
  await expect(page.locator(".match-resolution-final--accepted")).toBeVisible();

  const finalNames = await page.evaluate(() => {
    const raw = window.localStorage.getItem("wrestling-sim:match-resolution:v1");
    const data = raw ? JSON.parse(raw) as { records?: Array<{ attempts?: Array<{ finalResult?: { winnerName?: string; loserName?: string } }> }> } : {};
    const finalResult = data.records?.[0]?.attempts?.[0]?.finalResult;
    if (!finalResult?.winnerName || !finalResult.loserName) throw new Error("Accepted result was not stored.");
    const showsRaw = window.localStorage.getItem("tew-story-tracker:planned-shows:v1");
    const shows = showsRaw ? JSON.parse(showsRaw) as Array<{ id?: string; updatedAt?: string; segments?: Array<{ id?: string; plannedWinner?: string }> }> : [];
    const future = shows.find((show) => show.id === "future-consequence-show");
    const futureMatch = future?.segments?.find((segment) => segment.id === "future-consequence-match");
    if (!future || !futureMatch) throw new Error("Future booking was not found.");
    futureMatch.plannedWinner = finalResult.loserName;
    future.updatedAt = new Date().toISOString();
    window.localStorage.setItem("tew-story-tracker:planned-shows:v1", JSON.stringify(shows));
    return finalResult;
  });

  await page.getByRole("button", { name: "Consequences", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Make the official result matter/ })).toBeVisible();
  const pending = page.locator(".consequence-pending > article").filter({ hasText: "Jay White vs PAC" });
  await expect(pending).toContainText(`${finalNames.winnerName} defeated ${finalNames.loserName}`);
  await pending.getByRole("button", { name: "Apply Official Consequences" }).click();
  await expect(page.getByRole("status")).toContainText("updated standalone records");
  await expect(page.locator(".consequence-metrics")).toContainText("2");
  const detail = page.locator(".consequence-detail");
  await expect(detail.getByText("Popularity", { exact: true })).toHaveCount(2);
  await detail.locator(".consequence-ledger").first().getByText(/Open exact consequence calculation/).click();
  await expect(detail.getByText("Ordinary match wear", { exact: true }).first()).toBeVisible();
  await expect(detail.getByText("Match fatigue gained", { exact: true }).first()).toBeVisible();
  await expect(detail.getByText("Ranking-points change", { exact: true }).first()).toBeVisible();
  await expect(detail.getByText(/crowd-adjusted .* final rating was excluded/i).first()).toBeVisible();

  await page.getByRole("button", { name: "Records & Rankings" }).click();
  await expect(page.locator(".consequence-records > aside")).toContainText(finalNames.winnerName ?? "");
  await expect(page.locator(".consequence-records > aside")).toContainText(finalNames.loserName ?? "");
  const winnerRow = page.locator(".consequence-records > aside button").filter({ hasText: finalNames.winnerName ?? "" });
  await expect(winnerRow).toContainText("1-0-0");
  const loserRow = page.locator(".consequence-records > aside button").filter({ hasText: finalNames.loserName ?? "" });
  await expect(loserRow).toContainText("0-1-0");

  await page.getByRole("button", { name: "Reactive Booking" }).click();
  const conflict = page.locator(".consequence-future > section").first().locator("article").filter({ hasText: "Jay White vs PAC II" });
  await expect(conflict).toContainText(`${finalNames.loserName} is already planned to win`);
  await conflict.getByLabel("Jay White vs PAC II conflict resolution").fill("Keep the rematch tentative and review rankings after the next show.");
  await conflict.getByRole("button", { name: "Record Resolution" }).click();
  await expect(conflict).toContainText("Resolved");
  await expect(conflict).toContainText("Keep the rematch tentative");

  await page.reload();
  await page.getByRole("button", { name: "Consequences", exact: true }).click();
  await page.getByRole("button", { name: "Records & Rankings" }).click();
  await expect(page.locator(".consequence-records > aside")).toContainText(finalNames.winnerName ?? "");
  await page.getByRole("button", { name: "Reactive Booking" }).click();
  const persistedConflict = page.locator(".consequence-future > section").first().locator("article").filter({ hasText: "Jay White vs PAC II" });
  await expect(persistedConflict).toContainText("Resolved");

  const stored = await page.evaluate(() => {
    const consequencesRaw = window.localStorage.getItem("wrestling-sim:result-consequences:v1");
    const showsRaw = window.localStorage.getItem("tew-story-tracker:planned-shows:v1");
    return {
      consequences: consequencesRaw ? JSON.parse(consequencesRaw) as {
        applications?: Array<{ status?: string; calculationVersion?: string; competitiveCalculationVersion?: string; officialShowDate?: string; runningOrderPosition?: number; replayStatus?: string }>;
        workerRecords?: Array<{ workerName?: string; wins?: number; losses?: number }>;
        futureConflicts?: Array<{ resolved?: boolean; resolutionNote?: string }>;
      } : {},
      shows: showsRaw ? JSON.parse(showsRaw) as Array<{ name?: string; segments?: Array<{ title?: string; workflowStatus?: string; reconciliation?: { actualMatch?: { winner?: string } | null } }> }> : [],
    };
  });
  expect(stored.consequences.applications).toHaveLength(1);
  expect(stored.consequences.applications?.[0]?.status).toBe("Applied");
  expect(stored.consequences.applications?.[0]?.calculationVersion).toBe("wrestling-sim-consequences-6b22-v1");
  expect(stored.consequences.applications?.[0]).toMatchObject({ competitiveCalculationVersion: "wrestling-sim-competitive-6b20f-v1", officialShowDate: "2019-01-08", runningOrderPosition: 0, replayStatus: "Original" });
  expect(stored.consequences.workerRecords).toHaveLength(2);
  expect(stored.consequences.futureConflicts?.[0]).toMatchObject({ resolved: true, resolutionNote: "Keep the rematch tentative and review rankings after the next show." });
  const currentShow = stored.shows.find((show) => show.name === "PWL Consequence Test");
  expect(currentShow?.segments?.[0]).toMatchObject({ workflowStatus: "Reconciled", reconciliation: { actualMatch: { winner: finalNames.winnerName } } });
});
