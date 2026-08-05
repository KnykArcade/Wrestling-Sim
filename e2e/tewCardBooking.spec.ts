import { expect, test } from "@playwright/test";

test("uses a compact TEW-style card and previews wrestler approach quality before selection", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create First Show" }).first().click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL TEW Card Test");

  await page.getByRole("button", { name: "Add Match" }).click();
  const match = page.locator('[data-segment-type="match"]');
  await match.getByLabel("Segment name").fill("Jay White vs PAC");
  for (const name of ["Jay White", "PAC"]) {
    await match.getByLabel("Manual worker name").fill(name);
    await match.getByRole("button", { name: "Add Manual Worker" }).click();
  }

  const jay = match.locator('[data-match-worker="manual:jay white"]');
  await jay.getByText("Choose an approach for Jay White").click();
  const choices = jay.getByLabel("Available approaches for Jay White");
  const firstChoice = choices.locator(".approach-candidate").first();
  await expect(firstChoice.getByText(/Rating/)).toBeVisible();
  await expect(firstChoice.getByText(/Suitability/)).toBeVisible();
  await expect(firstChoice.getByText(/Stamina/)).toBeVisible();
  await expect(firstChoice.getByText(/Pace/)).toBeVisible();
  await expect(firstChoice.getByText(/Style:/)).toBeVisible();
  await expect(firstChoice.getByText(/Match aim:/)).toBeVisible();
  await expect(firstChoice.locator(".approach-quality")).toHaveText(/Elite|Strong|Capable|Developing|Weak/);
  await firstChoice.getByRole("button", { name: /^Add / }).click();
  await expect(jay.locator(".selected-approach-row")).toHaveCount(1);
  await expect(jay.getByText(/stamina remaining/)).toBeVisible();

  await match.getByRole("button", { name: "Save and Close" }).click();
  await expect(page.locator('[data-segment-type="match"]')).toHaveCount(0);
  const card = page.getByLabel("Current card summary");
  await expect(card.getByRole("button", { name: /Jay White vs PAC/ })).toBeVisible();
  await card.getByRole("button", { name: /Jay White vs PAC/ }).click();
  await expect(page.locator('[data-segment-type="match"]')).toHaveCount(1);
  await expect(page.getByLabel("Segment name")).toHaveValue("Jay White vs PAC");
  await expect(jay.locator(".selected-approach-row")).toHaveCount(1);
});
