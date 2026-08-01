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

test("loads MDB browser shims before evaluating the parser", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[type="file"]').setInputFiles({
    name: "invalid-test-snapshot.mdb",
    mimeType: "application/x-msaccess",
    buffer: Buffer.from("not a real Access database"),
  });

  const importError = page.getByRole("alert");
  await expect(importError).toBeVisible();
  await expect(importError).toContainText("Import failed");
  await expect(importError).not.toContainText("process is not defined");
  await expect(importError).not.toContainText("Buffer is not defined");
  await expect(importError).not.toContainText("global is not defined");

  const compatibilityGlobals = await page.evaluate(() => ({
    hasBuffer: typeof (globalThis as typeof globalThis & { Buffer?: unknown }).Buffer !== "undefined",
    hasGlobal: typeof (globalThis as typeof globalThis & { global?: unknown }).global !== "undefined",
    hasProcess: typeof (globalThis as typeof globalThis & { process?: unknown }).process !== "undefined",
  }));

  expect(compatibilityGlobals).toEqual({
    hasBuffer: true,
    hasGlobal: true,
    hasProcess: true,
  });
});
