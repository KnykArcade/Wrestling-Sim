import { expect, test } from "@playwright/test";

test("uses one compact TEW-style strategy board and preserves each wrestler's selections", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create First Show" }).first().click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL TEW Card Test");

  await page.getByRole("button", { name: "Add Match" }).click();
  const match = page.locator('[data-segment-type="match"]');
  await match.getByLabel("Segment name").fill("Manual match title");
  for (const name of ["Jay White", "PAC"]) {
    await match.getByLabel("Manual worker name").fill(name);
    await match.getByRole("button", { name: "Add Manual Worker" }).click();
  }
  await match.getByRole("button", { name: "Auto-Name Match" }).click();
  await expect(match.getByLabel("Segment name")).toHaveValue("Jay White vs PAC");

  const jay = match.locator('[data-match-worker="manual:jay white"]');
  const choices = match.getByLabel("Available approaches for Jay White");
  await expect(match.getByText("Approach Selection Board", { exact: true })).toHaveCount(1);
  await expect(choices.locator(".approach-candidate")).toHaveCount(16);
  const firstChoice = choices.locator(".approach-candidate").first();
  await expect(firstChoice).toHaveCSS("min-height", "68px");
  await expect(firstChoice.locator(".approach-rating-badge b")).toHaveText(/\d+\.\d/);
  const fitIndicators = firstChoice.locator(".approach-candidate__fit span");
  await expect(fitIndicators.filter({ hasText: /^Style / })).toHaveText(/^Style (Strong fit|Neutral)$/);
  await expect(fitIndicators.filter({ hasText: /^Match aim / })).toHaveText(/^Match aim (Strong fit|Clash|Neutral)$/);
  await expect(fitIndicators.filter({ hasText: /^Pace / })).toHaveText(/^Pace (Ideal|Usable|Risk)$/);
  await expect(fitIndicators.filter({ hasText: /^Stamina / })).toHaveText(/^Stamina \d+$/);
  await expect(firstChoice.locator(".approach-quality")).toHaveText(/Elite|Strong|Capable|Developing|Weak/);
  await expect(choices.getByText("Recommended", { exact: true })).toHaveCount(3);
  await expect(firstChoice.getByText("More details", { exact: true })).toHaveCount(0);
  await expect(firstChoice.getByText(/Rating source|Rating formula|Suitability/)).toHaveCount(0);
  await firstChoice.getByRole("button", { name: /^Select / }).click();
  await expect(jay.locator(".selected-approach-row")).toHaveCount(1);
  await expect(firstChoice.getByRole("button", { name: /selected for Jay White in slot 1/i })).toBeDisabled();
  await expect(jay.getByText(/stamina remaining/)).toBeVisible();

  const pac = match.locator('[data-match-worker="manual:pac"]');
  await pac.getByRole("button", { name: "Edit Strategy" }).click();
  await expect(match.getByLabel("Available approaches for PAC").locator(".approach-candidate")).toHaveCount(16);
  await expect(jay.locator(".selected-approach-row")).toHaveCount(1);

  await match.getByRole("button", { name: "Save and Close" }).click();
  await expect(page.locator('[data-segment-type="match"]')).toHaveCount(0);
  const card = page.getByLabel("Current card summary");
  await expect(card.getByRole("button", { name: /Jay White vs PAC/ })).toBeVisible();
  await card.getByRole("button", { name: /Jay White vs PAC/ }).click();
  await expect(page.locator('[data-segment-type="match"]')).toHaveCount(1);
  await expect(page.getByLabel("Segment name")).toHaveValue("Jay White vs PAC");
  await expect(page.locator('[data-match-worker="manual:jay white"] .selected-approach-row')).toHaveCount(1);
});

test("defaults booking to the activated company roster and keeps outside talent optional", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("wrestling-sim:starting-universe-activation:v1", JSON.stringify({ activeUniverseId: "pwl", activeCompanyId: "pwl", activeCompanyName: "Pro Wrestling League", gameDate: "2019-01-02", activatedAt: "2019-01-02T00:00:00.000Z", nextShowId: "", ledger: {}, lastReport: null }));
    localStorage.setItem("tew-story-tracker:workers:v1", JSON.stringify({ profiles: [
      { id: "strong", displayName: "Roderick Strong", source: "tew", linkedTewWorkerId: "w1", linkedTewWorkerName: "Roderick Strong", currentRole: "Wrestler" },
      { id: "ricochet", displayName: "Ricochet", source: "tew", linkedTewWorkerId: "w2", linkedTewWorkerName: "Trevor Mann", currentRole: "Wrestler" },
      { id: "nigel", displayName: "Nigel McGuinness", source: "tew", linkedTewWorkerId: "w3", linkedTewWorkerName: "Nigel McGuinness", currentRole: "Announcer" },
      { id: "cage", displayName: "Brian Cage", source: "tew", linkedTewWorkerId: "w4", linkedTewWorkerName: "Brian Cage", companyId: "impact", companyName: "Impact Wrestling", currentRole: "Wrestler" }
    ], relationships: [] }));
  });
  await page.reload();
  await page.getByRole("button", { name: "Create First Show" }).first().click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByRole("button", { name: "Add Match" }).click();
  const match = page.locator('[data-segment-type="match"]');

  await expect(match.getByLabel("Booking Company")).toHaveValue("Pro Wrestling League");
  await expect(match.getByLabel("Company wrestler").locator("option")).toHaveText(["Select a wrestler", "Ricochet", "Roderick Strong"]);
  await expect(match.getByText("2 active wrestlers in this company roster.")).toBeVisible();
  await expect(match.getByLabel("Length (minutes)")).toHaveCount(1);
  await expect(match.getByLabel("Length (minutes)")).toBeVisible();
  await expect(match.getByLabel("Match type")).toBeVisible();
  await expect(match.getByText("Nigel McGuinness")).toHaveCount(0);
  await match.getByLabel("Booking Company").selectOption("Impact Wrestling");
  await expect(match.getByLabel("Company wrestler").locator("option")).toHaveText(["Select a wrestler", "Brian Cage"]);
});
