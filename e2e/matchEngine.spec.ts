import { expect, test } from "@playwright/test";

test("loads canonical match data and calculates an approach rating", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Match Engine" }).click();

  await expect(page.getByRole("heading", { name: "Match Data Foundation" })).toBeVisible();
  await expect(page.getByText("15", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aerial Showstopper" })).toBeVisible();

  await page.getByLabel("Aerial rating").fill("80");
  await page.getByLabel("Athleticism rating").fill("70");
  await page.getByLabel("Flashiness rating").fill("60");
  await page.getByLabel("Basics rating").fill("50");
  await expect(page.locator(".approach-score strong")).toHaveText("70.00");

  await page.getByRole("button", { name: "Source Reconciliation" }).click();
  await expect(page.getByText("Counter Specialist", { exact: true })).toBeVisible();
  await expect(page.getByText("Ring General", { exact: true })).toBeVisible();
  await expect(page.getByText("Duration-based slots", { exact: false })).toBeVisible();
});
