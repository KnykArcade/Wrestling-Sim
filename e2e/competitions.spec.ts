import { expect, test } from "@playwright/test";
import { openAdvancedTools } from "./helpers";

test("builds a World Classic bracket and schedules a fixture onto a planned TEW show", async ({ page }) => {
  await page.goto("/");
  await openAdvancedTools(page);

  await page.getByRole("button", { name: "Planned Shows", exact: true }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL Classic Night");

  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Competitions" }).click();
  await expect(page.getByRole("heading", { name: "Create, book, track, and preserve every competition" })).toBeVisible();
  await page.getByRole("button", { name: "PWL World Classic" }).click();
  await expect(page.getByRole("heading", { name: "PWL World Classic" })).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByLabel("Competition expected participant count")).toHaveValue("8");
  await page.getByRole("button", { name: "Participants", exact: true }).click();

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
  const overlappingControls = await firstSemifinal.locator("button, select, input").evaluateAll((controls) => controls.flatMap((control, index) => {
    const first = control.getBoundingClientRect();
    if (first.width === 0 || first.height === 0) return [];
    return controls.slice(index + 1).flatMap((candidate) => {
      const second = candidate.getBoundingClientRect();
      const overlaps = first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
      return overlaps ? [`${control.getAttribute("aria-label") || control.textContent?.trim()} overlaps ${candidate.getAttribute("aria-label") || candidate.textContent?.trim()}`] : [];
    });
  }));
  expect(overlappingControls).toEqual([]);
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

test("creates a group-stage tournament with live group tables and a knockout bracket", async ({ page }) => {
  await page.goto("/");
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Competitions" }).click();
  await page.getByRole("button", { name: "Create Competition" }).first().click();
  await page.getByLabel("Competition name").fill("Global Gran Prix");
  await page.getByLabel("Competition format").selectOption("Group Stage + Knockout");
  await expect(page.getByLabel("Competition group count")).toHaveValue("2");
  await expect(page.getByLabel("Competition qualifiers per group")).toHaveValue("2");
  await page.getByRole("button", { name: "Participants", exact: true }).click();
  for (const name of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    await page.getByLabel("Manual competition participant").fill(name);
    await page.getByRole("button", { name: "Add Participant" }).click();
  }
  await page.getByRole("button", { name: "Generate Schedule" }).click();
  await expect(page.locator(".competition-round--group")).toHaveCount(6);
  await expect(page.locator(".competition-round--knockout")).toHaveCount(2);
  await page.getByRole("button", { name: "Standings", exact: true }).click();
  await expect(page.locator(".competition-group-standings > section")).toHaveCount(2);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edition history and action queue" })).toBeVisible();
});
