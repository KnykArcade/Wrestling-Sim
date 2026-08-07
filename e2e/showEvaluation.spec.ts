import { expect, test } from "@playwright/test";

test("calculates and accepts an angle before producing one permanent post-show report", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create First Show" }).first().click();
  await page.getByRole("button", { name: "Create Show" }).first().click();
  await page.getByLabel("Show name").fill("PWL Angle Evaluation Test");
  await page.getByRole("button", { name: "Add Angle" }).click();

  const angle = page.locator('[data-segment-type="angle"]');
  await angle.getByLabel("Segment name").fill("World Championship Faceoff");
  await angle.getByLabel("Manual worker name").fill("PAC");
  await angle.getByRole("button", { name: "Add Manual Worker" }).click();
  await angle.getByLabel("Full Segment Output").fill("PAC enters the ring and makes his championship intentions clear before holding his ground at center ring.");

  await page.getByRole("button", { name: "Run This Show" }).click();
  await page.getByRole("button", { name: "Start Live Show" }).click();
  await page.getByRole("button", { name: "Calculate Angle Result" }).click();
  await expect(page.getByLabel("Angle result review")).toBeVisible();
  await page.getByRole("button", { name: "Accept Angle Result" }).click();
  await expect(page.getByText("Participant momentum and popularity effects were recorded exactly once.")).toBeVisible();
  await page.getByRole("button", { name: "Complete Live Show" }).click();
  await expect(page.getByRole("heading", { name: "PWL Angle Evaluation Test is complete" })).toBeVisible();
  await expect(page.getByText("POST-SHOW REPORT")).toBeVisible();

  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("wrestling-sim:show-evaluation:v1") || "{}") as {
    angleEvaluations?: Array<{ appliedAt?: string }>;
    showReports?: Array<{ showName?: string; appliedAt?: string }>;
  });
  expect(stored.angleEvaluations).toHaveLength(1);
  expect(stored.angleEvaluations?.[0].appliedAt).toBeTruthy();
  expect(stored.showReports).toHaveLength(1);
  expect(stored.showReports?.[0]).toMatchObject({ showName: "PWL Angle Evaluation Test", appliedAt: expect.any(String) });
  const live = await page.evaluate(() => JSON.parse(window.localStorage.getItem("wrestling-sim:live-card:v1") || "{}") as { sessions?: Array<{ crowdStart?: number; currentCrowd?: number; progress?: Array<{ audience?: { performanceRating?: number; crowdResponse?: number; finalRating?: number; crowdBefore?: number; crowdAfter?: number } }> }> });
  expect(live.sessions?.[0].crowdStart).toEqual(expect.any(Number));
  expect(live.sessions?.[0].progress?.[0].audience).toMatchObject({ performanceRating: expect.any(Number), crowdResponse: expect.any(Number), finalRating: expect.any(Number), crowdBefore: expect.any(Number), crowdAfter: expect.any(Number) });
});
