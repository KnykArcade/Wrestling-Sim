import { expect, test } from "@playwright/test";

test("creates and persists match and angle narratives without browser errors", async ({ page }) => {
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
  await expect(
    page.getByRole("heading", { name: "Plan the show, run it in TEW, then preserve what actually happened" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("Monday Night Test");
  await page.getByRole("button", { name: "Add Match" }).click();
  await page.getByRole("button", { name: "Add Angle" }).click();

  const match = page.locator('[data-segment-type="match"]');
  const angle = page.locator('[data-segment-type="angle"]');

  await match.getByLabel("Full match story").fill(
    "Bret controls the knee, survives a late comeback, and wins with the Sharpshooter.",
  );
  await match.getByLabel("Planned winner").fill("Bret Hart");
  await match.getByLabel("Planned finish").fill("Submission");
  await match.getByLabel("Manual worker name").fill("Bret Hart");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();

  await angle.getByLabel("Full Segment Output").fill(
    "The champion opens the show, is interrupted by the challenger, and accepts the main event.",
  );
  await angle.getByLabel("Manual storyline name").fill("World Title Rivalry");
  await angle.getByRole("button", { name: "Add Manual Storyline" }).click();

  await expect(page.getByText("2 planned segments")).toBeVisible();
  await expect(page.getByText("2 narratives complete")).toBeVisible();
  await expect(match.getByText("Bret Hart", { exact: true })).toBeVisible();
  await expect(angle.getByText("World Title Rivalry", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Reconcile Results" }).click();
  await expect(page.getByRole("heading", { name: "Connect the plan to the completed TEW show" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Import the post-show TEW snapshot" })).toBeVisible();
  await page.getByRole("button", { name: "Plan Card" }).click();

  await page.reload();
  await expect(page.getByLabel("Show name")).toHaveValue("Monday Night Test");
  await expect(page.locator('[data-segment-type="match"]').getByLabel("Full match story")).toContainText(
    "Bret controls the knee",
  );
  await expect(page.locator('[data-segment-type="angle"]').getByLabel("Full Segment Output")).toContainText(
    "The champion opens the show",
  );
  await expect(page.getByText("2 narratives complete")).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("loads MDB browser shims before evaluating the parser", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "TEW Show History" }).click();

  await page.locator('input[accept*=".mdb"]').setInputFiles({
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
