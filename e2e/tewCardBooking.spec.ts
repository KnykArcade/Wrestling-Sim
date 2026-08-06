import { expect, test } from "@playwright/test";

test("uses a compact TEW-style card and previews wrestler approach quality before selection", async ({ page }) => {
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
  const choices = jay.getByLabel("Available approaches for Jay White");
  await expect(jay.getByText("Approach Selection Board", { exact: true })).toBeVisible();
  await expect(choices.locator(".approach-candidate")).toHaveCount(16);
  const firstChoice = choices.locator(".approach-candidate").first();
  await expect(firstChoice.locator(".approach-rating-gauge b")).toHaveText(/\d+\.\d/);
  await expect(firstChoice.getByText(/^Style$/)).toBeVisible();
  await expect(firstChoice.getByText(/^Match aim$/)).toBeVisible();
  await expect(firstChoice.getByText(/^Pace$/)).toBeVisible();
  await expect(firstChoice.getByText(/^Stamina$/)).toBeVisible();
  await expect(firstChoice.locator(".approach-quality")).toHaveText(/Elite|Strong|Capable|Developing|Weak/);
  await expect(choices.getByText("Recommended", { exact: true })).toHaveCount(3);
  await expect(firstChoice.getByText("More details", { exact: true })).toHaveCount(0);
  await expect(firstChoice.getByText(/Rating source|Rating formula|Suitability/)).toHaveCount(0);
  await firstChoice.getByRole("button", { name: /^Select / }).click();
  await expect(jay.locator(".selected-approach-row")).toHaveCount(1);
  await expect(firstChoice.getByRole("button", { name: /selected for Jay White in slot 1/i })).toBeDisabled();
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
