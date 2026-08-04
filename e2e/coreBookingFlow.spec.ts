import { expect, test } from "@playwright/test";

test("creates a first show and a valid match from the primary booking path", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create First Show" }).first().click();
  await expect(page.getByRole("heading", { name: "Plan the show for TEW, add match approaches, then preserve what actually happened" })).toBeVisible();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await expect(page.getByText("New planned show created.")).toBeVisible();
  await page.getByLabel("Show name").fill("PWL Power Hour");
  await page.getByRole("button", { name: "Add Match" }).click();
  await expect(page.getByText("Match added. Choose the format and wrestlers below.")).toBeVisible();

  const match = page.locator('[data-segment-type="match"]');
  await match.getByLabel("Match format").selectOption("Tag Team");
  for (const name of ["Alex Shelley", "Chris Sabin", "Mark Davis", "Kyle Fletcher"]) {
    await match.getByLabel("Manual worker name").fill(name);
    await match.getByRole("button", { name: "Add Manual Worker" }).click();
  }

  await expect(match.getByText("Match setup is ready.")).toBeVisible();
  await expect(match.getByLabel("Side / team")).toHaveCount(4);
  await expect(match.getByLabel("Side / team").nth(0)).toHaveValue("Team 1");
  await expect(match.getByLabel("Side / team").nth(3)).toHaveValue("Team 2");
  await expect(page.getByLabel("Current card summary")).toContainText("Tag Team · 4 wrestlers");

  await page.reload();
  await page.getByRole("button", { name: "Book Shows" }).click();
  await expect(page.getByLabel("Show name")).toHaveValue("PWL Power Hour");
  await expect(page.locator('[data-segment-type="match"]').getByText("Match setup is ready.")).toBeVisible();
});
