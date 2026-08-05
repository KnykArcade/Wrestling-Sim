import { expect, test } from "@playwright/test";

test("books, runs, resolves, records, and completes one show without losing context", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create First Show" }).first().click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL Unified Flow Test");
  await page.getByRole("button", { name: "Add Match" }).click();

  const match = page.locator('[data-segment-type="match"]');
  await match.getByLabel("Segment name").fill("PAC vs Jay White");
  for (const name of ["PAC", "Jay White"]) {
    await match.getByLabel("Manual worker name").fill(name);
    await match.getByRole("button", { name: "Add Manual Worker" }).click();
  }
  await match.getByRole("button", { name: "Run AI for All Competitors" }).click();
  await expect(match.getByText("Match setup is ready.")).toBeVisible();

  await page.getByRole("button", { name: "Run This Show" }).click();
  await expect(page.getByLabel("Live card planned show").locator("option:checked")).toContainText("PWL Unified Flow Test");
  await expect(page.getByRole("button", { name: "Start Live Show" })).toBeEnabled();
  await page.getByRole("button", { name: "Start Live Show" }).click();
  await page.getByRole("button", { name: "Run This Match" }).click();
  await expect(page.getByLabel("Resolution planned match").locator("option:checked")).toContainText("PAC vs Jay White");
  await page.getByRole("button", { name: "Run Official Match Calculation" }).click();
  await page.getByRole("button", { name: "Accept Engine Result" }).click();

  await expect(page.getByRole("heading", { name: /Run the show one segment at a time/ })).toBeVisible();
  await expect(page.getByLabel("Live card planned show").locator("option:checked")).toContainText("PWL Unified Flow Test");
  await page.getByRole("button", { name: "Lock Result Into Live Card" }).click();
  await expect(page.getByText("Result locked and consequences recorded once")).toBeVisible();
  await expect(page.getByRole("button", { name: "View Applied Consequences" })).toBeVisible();
  await page.getByRole("button", { name: "Complete Live Show" }).click();
  await expect(page.getByRole("heading", { name: "PWL Unified Flow Test is complete" })).toBeVisible();

  const stored = await page.evaluate(() => ({
    live: JSON.parse(window.localStorage.getItem("wrestling-sim:live-card:v1") || "{}") as { sessions?: Array<{ status?: string }> },
    consequences: JSON.parse(window.localStorage.getItem("wrestling-sim:result-consequences:v1") || "{}") as { applications?: unknown[] },
  }));
  expect(stored.live.sessions?.[0]?.status).toBe("Completed");
  expect(stored.consequences.applications).toHaveLength(1);
});
