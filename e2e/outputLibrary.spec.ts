import { expect, test } from "@playwright/test";

test("saves a Workbench match into permanent output lineage and restores it after reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Match & Angle Workbench" }).click();

  await page.getByLabel("Workbench segment name").fill("Jay White vs PAC");
  await page.getByLabel("Workbench duration").fill("18");
  await page.getByLabel("Quick manual worker name").fill("Jay White");
  await page.getByRole("button", { name: "Add Manual Worker" }).click();
  await page.getByLabel("Quick manual worker name").fill("PAC");
  await page.getByRole("button", { name: "Add Manual Worker" }).click();
  await page.getByLabel("Workbench planned winner").fill("Jay White");
  await page.getByLabel("Workbench planned finish").fill("Blade Runner after a referee distraction");
  await page.getByLabel("Workbench current output").fill("PAC controls the opening before Jay White creates the decisive mistake and steals the finish.");
  await page.getByLabel("Workbench key moments").fill("Opening: PAC pushes the pace.\nFinish: Blade Runner.");

  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem("tew-story-tracker:workbench:v1");
    if (!raw) return "";
    const data = JSON.parse(raw) as { quickSegments?: Array<{ segment?: { title?: string } }> };
    return data.quickSegments?.[0]?.segment?.title ?? "";
  })).toBe("Jay White vs PAC");

  await page.getByRole("button", { name: "Save Current Segment to Output Library" }).click();
  await expect(page.locator(".workbench-output-library-bridge").getByRole("status")).toContainText("saved");
  await page.getByRole("button", { name: "Open Output Library" }).click();

  await expect(page.getByRole("heading", { name: "Output Library and Road-Agent Workflow" })).toBeVisible();
  await expect(page.getByText("Jay White vs PAC", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Road-Agent Match Package" })).toBeVisible();
  await expect(page.getByText("Plan", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Applied Output", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("PAC controls the opening before Jay White creates the decisive mistake and steals the finish.", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Reusable output structure name").fill("Main Event Escape Structure");
  await page.getByRole("button", { name: "Create Reusable Structure" }).click();
  await page.locator(".output-library-tabs").getByRole("button", { name: "Reusable Structures" }).click();
  await expect(page.getByRole("heading", { name: "Production guidance without prebooking wrestlers or outcomes" })).toBeVisible();
  await expect(page.getByText("Main Event Escape Structure", { exact: true })).toBeVisible();

  await page.reload();
  await page.locator(".global-tabbar").getByRole("button", { name: "Output Library" }).click();
  await page.locator(".output-library-tabs").getByRole("button", { name: "Output Library" }).click();
  await expect(page.getByText("Jay White vs PAC", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Road-Agent Match Package" })).toBeVisible();
});
