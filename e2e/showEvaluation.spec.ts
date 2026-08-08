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
  await expect(page.getByLabel("Angle result review")).toContainText("Raw performance");
  await expect(page.getByLabel("Angle result review")).toContainText("Anticipation");
  await expect(page.getByLabel("Angle result review")).toContainText("Live crowd response");
  await expect(page.getByLabel("Angle result review")).toContainText("Official rating");
  await page.getByText(/Open exact angle calculation/).click();
  await expect(page.getByText("Raw angle performance", { exact: true })).toBeVisible();
  await expect(page.getByText("Angle anticipation", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Accept Angle Result" }).click();
  await expect(page.getByText("Participant momentum and popularity effects were recorded exactly once.")).toBeVisible();
  await page.getByRole("button", { name: "Complete Live Show" }).click();
  await expect(page.getByRole("heading", { name: "PWL Angle Evaluation Test is complete" })).toBeVisible();
  await expect(page.getByText("POST-SHOW REPORT")).toBeVisible();
  await page.getByText(/Open exact show calculation/).click();
  await expect(page.getByText("Promotion strength", { exact: true })).toBeVisible();
  await expect(page.getByText("Expected card strength", { exact: true })).toBeVisible();
  await expect(page.getByText("Attendance demand", { exact: true })).toBeVisible();
  await expect(page.getByText("Overall show rating", { exact: true })).toBeVisible();

  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("wrestling-sim:show-evaluation:v1") || "{}") as {
    angleEvaluations?: Array<{ appliedAt?: string; calculationVersion?: string; setupFingerprint?: string; rawPerformance?: number; anticipation?: number; crowdResponse?: number }>;
    showReports?: Array<{ showName?: string; appliedAt?: string; calculationVersion?: string; segments?: Array<{ durationWeight?: number; sectionWeight?: number; mainEventWeight?: number; weightedContribution?: number }> }>;
  });
  expect(stored.angleEvaluations).toHaveLength(1);
  expect(stored.angleEvaluations?.[0].appliedAt).toBeTruthy();
  expect(stored.angleEvaluations?.[0]).toMatchObject({ calculationVersion: "wrestling-sim-angles-6b20e-v1", setupFingerprint: expect.any(String), rawPerformance: expect.any(Number), anticipation: expect.any(Number), crowdResponse: expect.any(Number) });
  expect(stored.showReports).toHaveLength(1);
  expect(stored.showReports?.[0]).toMatchObject({ showName: "PWL Angle Evaluation Test", appliedAt: expect.any(String), calculationVersion: "wrestling-sim-shows-6b20e-v1", segments: [expect.objectContaining({ durationWeight: expect.any(Number), sectionWeight: 1, mainEventWeight: 1.4, weightedContribution: expect.any(Number) })] });
  const live = await page.evaluate(() => JSON.parse(window.localStorage.getItem("wrestling-sim:live-card:v1") || "{}") as { sessions?: Array<{ crowdStart?: number; currentCrowd?: number; expectationSnapshot?: { estimatedAttendance?: number; expectedShowScore?: number; calculationVersion?: string }; progress?: Array<{ audience?: { performanceRating?: number; anticipation?: number; crowdResponse?: number; finalRating?: number; crowdBefore?: number; crowdAfter?: number } }> }> });
  expect(live.sessions?.[0].crowdStart).toEqual(expect.any(Number));
  expect(live.sessions?.[0].expectationSnapshot).toMatchObject({ estimatedAttendance: expect.any(Number), expectedShowScore: expect.any(Number), calculationVersion: "wrestling-sim-shows-6b20e-v1" });
  expect(live.sessions?.[0].progress?.[0].audience).toMatchObject({ performanceRating: expect.any(Number), anticipation: expect.any(Number), crowdResponse: expect.any(Number), finalRating: expect.any(Number), crowdBefore: expect.any(Number), crowdAfter: expect.any(Number) });
});
