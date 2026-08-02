import { expect, test } from "@playwright/test";
import { openAdvancedTools } from "./helpers";

test("builds a World Classic bracket and schedules a fixture onto a planned TEW show", async ({ page }) => {
  await page.goto("/");
  await openAdvancedTools(page);

  await page.getByRole("button", { name: "Planned Shows" }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL Classic Night");

  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Competitions" }).click();
  await expect(page.getByRole("heading", { name: "Tournaments, Cups, Leagues, and Classics" })).toBeVisible();
  await page.getByRole("button", { name: "PWL World Classic" }).click();
  await expect(page.getByRole("heading", { name: "PWL World Classic" })).toBeVisible();

  for (const name of ["Jay White", "PAC", "Eddie Kingston", "Brian Cage"]) {
    await page.getByLabel("Manual competition participant").fill(name);
    await page.getByRole("button", { name: "Add Participant" }).click();
  }
  await expect(page.locator(".competition-participant-list article")).toHaveCount(4);
  await page.getByRole("button", { name: "Generate Bracket" }).click();
  await expect(page.getByRole("heading", { name: "Bracket" })).toBeVisible();
  await expect(page.locator(".competition-fixture")).toHaveCount(3);

  const firstSemifinal = page.locator(".competition-fixture").first();
  await firstSemifinal.getByLabel(/target show/).selectOption({ index: 1 });
  await firstSemifinal.getByRole("button", { name: "Add to Planned Show" }).click();
  await expect(firstSemifinal.getByRole("button", { name: "Open Planned Match" })).toBeVisible();
  await firstSemifinal.getByRole("button", { name: "Open Planned Match" }).click();
  await expect(page.getByLabel("Show name")).toHaveValue("PWL Classic Night");
  await expect(page.locator('[data-segment-type="match"]').getByLabel("Segment name")).toHaveValue(/Semifinal/);

  await page.reload();
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Competitions" }).click();
  await expect(page.getByRole("heading", { name: "PWL World Classic" })).toBeVisible();
  await page.getByRole("button", { name: "Bracket and Schedule" }).click();
  await expect(page.locator(".competition-fixture").first().getByRole("button", { name: "Open Planned Match" })).toBeVisible();
});
