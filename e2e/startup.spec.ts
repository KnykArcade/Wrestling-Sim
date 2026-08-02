import { expect, test } from "@playwright/test";

test("creates and persists match and angle narratives without browser errors", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TEW IX Story Tracker" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "One show. One operational path. TEW remains the game." })).toBeVisible();
  await page.getByRole("button", { name: "Planned Shows" }).click();
  await expect(page.getByRole("heading", { name: "Plan the show for TEW, add match approaches, then preserve what actually happened" })).toBeVisible();

  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("Monday Night Test");
  await page.getByRole("button", { name: "Add Match" }).click();
  await page.getByRole("button", { name: "Add Angle" }).click();
  const match = page.locator('[data-segment-type="match"]');
  const angle = page.locator('[data-segment-type="angle"]');
  await match.getByLabel("Full match story").fill("Bret controls the knee, survives a late comeback, and wins with the Sharpshooter.");
  await match.getByLabel("Planned winner").fill("Bret Hart");
  await match.getByLabel("Planned finish").fill("Submission");
  await match.getByLabel("Manual worker name").fill("Bret Hart");
  await match.getByRole("button", { name: "Add Manual Worker" }).click();
  await angle.getByLabel("Full Segment Output").fill("The champion opens the show, is interrupted by the challenger, and accepts the main event.");
  await angle.getByLabel("Manual storyline name").fill("World Title Rivalry");
  await angle.getByRole("button", { name: "Add Manual Storyline" }).click();
  await expect(page.getByText("2 planned segments")).toBeVisible();
  await expect(page.getByText("2 narratives complete")).toBeVisible();
  await expect(match.locator(".narrative-person-name strong").filter({ hasText: "Bret Hart" })).toBeVisible();
  await expect(angle.getByText("World Title Rivalry", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Reconcile Results" }).click();
  await expect(page.getByRole("heading", { name: "Connect the plan to the completed TEW show" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Import the post-show TEW snapshot" })).toBeVisible();
  await page.getByRole("button", { name: "Plan Card" }).click();

  await page.reload();
  await page.getByRole("button", { name: "Planned Shows" }).click();
  await expect(page.getByLabel("Show name")).toHaveValue("Monday Night Test");
  await expect(page.locator('[data-segment-type="match"]').getByLabel("Full match story")).toContainText("Bret controls the knee");
  await expect(page.locator('[data-segment-type="angle"]').getByLabel("Full Segment Output")).toContainText("The champion opens the show");
  await expect(page.getByText("2 narratives complete")).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("creates a storyline and builds its timeline from planned segments", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Planned Shows" }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("Timeline Test Show");
  await page.getByRole("button", { name: "Add Angle" }).click();
  const angle = page.locator('[data-segment-type="angle"]');
  await angle.getByLabel("Segment name").fill("Opening Challenge");
  await angle.getByLabel("Full Segment Output").fill("The challenger demands a championship match.");
  await angle.getByLabel("Manual worker name").fill("Bret Hart");
  await angle.getByRole("button", { name: "Add Manual Worker" }).click();
  await angle.getByLabel("Manual storyline name").fill("World Title Rivalry");
  await angle.getByRole("button", { name: "Add Manual Storyline" }).click();

  await page.getByRole("button", { name: "Storyline Hub" }).click();
  await expect(page.getByRole("heading", { name: "Storyline Hub and Timeline" })).toBeVisible();
  await page.getByRole("button", { name: "Create Storyline" }).first().click();
  await page.getByLabel("Storyline name").fill("World Title Rivalry");
  await page.getByLabel("Storyline status", { exact: true }).selectOption("Active");
  await page.getByLabel("Manual participant name").fill("Bret Hart");
  await page.getByRole("button", { name: "Add Manual Participant" }).click();
  await page.getByRole("button", { name: "Add Milestone" }).click();
  await expect(page.getByRole("heading", { name: "Opening Challenge" })).toBeVisible();
  await expect(page.getByText("1 linked segment")).toBeVisible();
  await page.getByRole("button", { name: "Open Related Show and Segment" }).click();
  await expect(page.getByLabel("Show name")).toHaveValue("Timeline Test Show");
  await expect(page.locator('[data-segment-id]').getByLabel("Segment name")).toHaveValue("Opening Challenge");

  await page.getByRole("button", { name: "Storyline Hub" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Storyline Hub" }).click();
  await expect(page.getByLabel("Storyline name")).toHaveValue("World Title Rivalry");
  await expect(page.getByText("Bret Hart", { exact: true })).toBeVisible();
});

test("creates worker profiles character arcs and a relationship network", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Worker Hub" }).click();
  await expect(page.getByRole("heading", { name: "Worker Creative Profiles and Relationship Network" })).toBeVisible();

  await page.getByRole("button", { name: "Create Manual Worker" }).first().click();
  await page.getByLabel("Display name").fill("Bret Hart");
  await page.getByLabel("Worker alignment").selectOption("Face");
  await page.getByLabel("Current creative direction").fill("Pursuing the world championship through technical wrestling.");
  await page.getByRole("button", { name: "Add Character Arc" }).click();
  await page.getByLabel("Arc name").fill("Road to the Championship");
  await page.getByLabel("Arc status").selectOption("Active");

  await page.getByRole("button", { name: "Create Manual Worker" }).first().click();
  await page.getByLabel("Display name").fill("Shawn Michaels");
  await page.getByLabel("Worker alignment").selectOption("Heel");
  await page.getByLabel("Relationship worker").selectOption({ label: "Bret Hart" });
  await page.getByRole("button", { name: "Add Relationship" }).click();
  await expect(page.getByText("Rival · Planned")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Worker Hub" }).click();
  await page.getByRole("button", { name: /Shawn Michaels/ }).click();
  await expect(page.getByLabel("Display name")).toHaveValue("Shawn Michaels");
  await expect(page.getByText("Rival · Planned")).toBeVisible();
});

test("creates schedules and searches a future booking idea", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "One show. One operational path. TEW remains the game." })).toBeVisible();

  await page.getByRole("button", { name: "Planned Shows" }).click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("Future Supercard");

  await page.getByRole("button", { name: "Control Center" }).click();
  await page.getByRole("button", { name: "Future Booking Board" }).click();
  await page.getByRole("button", { name: "Create Booking Idea" }).first().click();
  await page.getByLabel("Idea title").fill("World Championship Challenge");
  await page.getByLabel("Booking idea type").selectOption("Match");
  await page.getByLabel("Booking idea status", { exact: true }).selectOption("Ready");
  await page.getByLabel("Target show").selectOption({ index: 1 });
  await page.getByLabel("Full concept").fill("The top contender challenges the champion in the main event.");
  await page.getByRole("button", { name: "Add to Target Show" }).click();
  await expect(page.getByRole("button", { name: "Already Scheduled" })).toBeDisabled();
  await page.getByRole("button", { name: "Open Scheduled Segment" }).click();
  await expect(page.getByLabel("Show name")).toHaveValue("Future Supercard");
  await expect(page.getByLabel("Segment name")).toHaveValue("World Championship Challenge");

  await page.getByRole("button", { name: "Control Center" }).click();
  await page.getByRole("button", { name: "Global Search" }).click();
  await page.getByLabel("Global creative search").fill("World Championship Challenge");
  await expect(
    page.locator(".search-result-list button")
      .filter({ hasText: "Booking Idea" })
      .filter({ hasText: "World Championship Challenge" }),
  ).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Control Center" }).click();
  await page.getByRole("button", { name: "Future Booking Board" }).click();
  await expect(page.getByLabel("Idea title")).toHaveValue("World Championship Challenge");
});

test("creates a championship lineage and contender ranking", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Championships" }).click();
  await expect(page.getByRole("heading", { name: "Championship Hub, Rankings, and Competitive Records" })).toBeVisible();

  await page.getByRole("button", { name: "Create Championship" }).first().click();
  await page.getByLabel("Championship name").fill("PWL Championship");
  await page.getByLabel("Current champions").fill("Bret Hart");
  await page.getByLabel("Championship status").selectOption("Active");
  await page.getByLabel("Date won").fill("2026-08-01");
  await page.getByRole("button", { name: "Lineage" }).click();
  await page.getByRole("button", { name: "Add Current Reign" }).click();
  await expect(page.getByText("Bret Hart", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Rankings" }).click();
  await page.getByRole("button", { name: "Add Ranking" }).click();
  await page.getByLabel("Rank 1 competitors").fill("Shawn Michaels");
  await page.getByLabel("Rank 1 record").fill("4-1-0");
  await page.getByLabel("Rank 1 reason").fill("Four wins in the last five recorded matches.");
  await expect(page.getByLabel("Rank 1 competitors")).toHaveValue("Shawn Michaels");

  await page.reload();
  await page.getByRole("button", { name: "Championships" }).click();
  await expect(page.getByLabel("Championship name")).toHaveValue("PWL Championship");
  await page.getByRole("button", { name: "Rankings" }).click();
  await expect(page.getByLabel("Rank 1 competitors")).toHaveValue("Shawn Michaels");
});

test("loads MDB browser shims before evaluating the parser", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "TEW Show History" }).click();
  await page.locator('input[accept*=".mdb"]').setInputFiles({ name: "invalid-test-snapshot.mdb", mimeType: "application/x-msaccess", buffer: Buffer.from("not a real Access database") });
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
  expect(compatibilityGlobals).toEqual({ hasBuffer: true, hasGlobal: true, hasProcess: true });
});
