import { expect, test } from "@playwright/test";
import { openAdvancedTools } from "./helpers";

test("books wrestlers without a winner, runs one official result, and preserves an explicit override", async ({ page }) => {
  await page.goto("/");
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows", exact: true }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL Reactive Booking Test");
  await page.getByRole("button", { name: "Add Match" }).click();

  const match = page.locator('[data-segment-type="match"]').first();
  await match.getByLabel("Segment name").fill("Jay White vs PAC");
  await match.getByLabel("Length (minutes)").fill("20");
  await match.getByLabel("Manual worker name").fill("Jay White");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();
  await match.getByLabel("Manual worker name").fill("PAC");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();
  await match.getByRole("button", { name: "Run AI for All Competitors" }).click();
  await match.getByLabel("Performance preview chemistry").fill("2");
  await expect(match.locator(".tew-strategy-row")).toHaveCount(2);
  await expect(match.getByLabel("Planned winner")).toHaveValue("");
  await expect(page.locator(".save-state")).toHaveText("Saved");

  await page.getByRole("button", { name: "Run Matches", exact: true }).click();
  await expect(page.getByRole("heading", { name: /You book the opportunity. The wrestlers create the outcome/ })).toBeVisible();
  await expect(page.getByLabel("Resolution planned show").locator("option:checked")).toContainText("PWL Reactive Booking Test");
  await expect(page.getByLabel("Resolution planned match").locator("option:checked")).toContainText("Jay White vs PAC");

  const jay = page.locator(".match-resolution-worker-card").filter({ has: page.getByRole("heading", { name: "Jay White", exact: true }) });
  const pac = page.locator(".match-resolution-worker-card").filter({ has: page.getByRole("heading", { name: "PAC", exact: true }) });
  await expect(jay.getByText("Counter Specialist", { exact: true })).toBeVisible();
  await expect(jay.getByText("Pace Controller", { exact: true })).toBeVisible();
  await expect(pac.getByText("Counter Specialist", { exact: true })).toBeVisible();
  await expect(pac.getByText("Pace Controller", { exact: true })).toBeVisible();
  await expect(page.locator(".match-resolution-approach-grid > label")).toHaveCount(32);
  await expect(jay.getByLabel("Jay White approach mode")).toHaveValue("Manual");
  await expect(pac.getByLabel("PAC approach mode")).toHaveValue("Manual");
  await expect(jay.locator('.match-resolution-approach-grid input:checked')).toHaveCount(3);
  await expect(pac.locator('.match-resolution-approach-grid input:checked')).toHaveCount(3);
  await expect(page.locator(".match-resolution-context-grid")).toContainText("Main Event");
  await expect(page.locator(".match-resolution-context-grid")).toContainText("+2");

  await jay.getByText("Dirty Rulebreaker", { exact: true }).click();
  await pac.getByText("Counter Specialist", { exact: true }).click();
  await page.getByRole("button", { name: "Run Official Match Calculation" }).click();
  await expect(page.locator(".match-resolution-result").getByText("OFFICIAL ENGINE RESULT", { exact: true })).toBeVisible();
  await expect(page.getByText("Result roll", { exact: true })).toBeVisible();
  await expect(page.getByText("Performance MVP", { exact: true })).toBeVisible();
  const ledger = page.getByLabel("Complete match calculation ledger");
  await expect(ledger.getByRole("heading", { name: "Every score stays in its own lane" })).toBeVisible();
  await expect(ledger.getByText("Recommendation", { exact: true })).toBeVisible();
  await expect(ledger.getByText("Raw match", { exact: true })).toBeVisible();
  await expect(ledger.getByText("Crowd response", { exact: true })).toBeVisible();
  await expect(ledger.getByText("Final rating", { exact: true })).toBeVisible();
  await ledger.getByText("Open full input, weight, bonus, penalty, cap, and rounding breakdown", { exact: true }).click();
  await expect(ledger.getByText("Raw in-ring match score", { exact: true }).first()).toBeVisible();
  await expect(ledger.getByText("Win probability and result roll", { exact: true })).toBeVisible();
  await expect(ledger.getByText("Momentum confidence above/below 50", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Create New Calculation After Material Change" })).toBeDisabled();

  const engineWinnerText = await page.locator(".match-resolution-result > header h2").textContent();
  expect(engineWinnerText).toMatch(/defeated/);

  await page.getByLabel("Resolution override finish type").selectOption("No Contest");
  await expect(page.getByLabel("Resolution override winner")).toBeDisabled();
  await page.getByLabel("Resolution override reason").fill("Closing chaos forced the referee to throw the match out.");
  await page.getByLabel("Resolution override description").fill("The match ended without a winner after the referee lost control.");
  await page.getByRole("button", { name: "Confirm Booker Override" }).click();
  await expect(page.locator(".match-resolution-final--overridden")).toBeVisible();
  await expect(page.locator(".match-resolution-final--overridden")).toContainText("Match ended in a No Contest");
  await expect(page.locator(".match-resolution-final--overridden")).toContainText("Override reason");
  await expect(page.locator(".match-resolution-audit")).toContainText("Attempt 1 · Overridden");

  await page.reload();
  await page.getByRole("button", { name: "Run Matches", exact: true }).click();
  await expect(page.getByLabel("Resolution planned show").locator("option:checked")).toContainText("PWL Reactive Booking Test");
  await expect(page.locator(".match-resolution-final--overridden")).toBeVisible();
  await expect(page.locator(".match-resolution-result > header h2")).toHaveText(engineWinnerText ?? "");
  await expect(page.locator(".match-resolution-audit")).toContainText("Attempt 1 · Overridden");

  const stored = await page.evaluate(() => {
    const raw = window.localStorage.getItem("wrestling-sim:match-resolution:v1");
    return raw ? JSON.parse(raw) as { records?: Array<{ status?: string; attempts?: Array<{ status?: string; engineResult?: { winnerName?: string }; finalResult?: { winnerName?: string; loserName?: string; finishType?: string; acceptedEngineResult?: boolean; overrideReason?: string } }> }> } : {};
  });
  expect(stored.records).toHaveLength(1);
  expect(stored.records?.[0]?.status).toBe("Overridden");
  expect(stored.records?.[0]?.attempts).toHaveLength(1);
  expect(stored.records?.[0]?.attempts?.[0]?.engineResult?.winnerName).toBeTruthy();
  expect(stored.records?.[0]?.attempts?.[0]?.finalResult).toMatchObject({
    winnerName: "",
    loserName: "",
    finishType: "No Contest",
    acceptedEngineResult: false,
    overrideReason: "Closing chaos forced the referee to throw the match out.",
  });
});
