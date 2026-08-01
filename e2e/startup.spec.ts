import { expect, test } from "@playwright/test";

test("renders the Phase 1 import screen without browser errors", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "TEW IX Story Tracker" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open a TEW IX MDB snapshot" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select MDB File" })).toBeVisible();
  await expect(page.locator("body")).not.toBeEmpty();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
