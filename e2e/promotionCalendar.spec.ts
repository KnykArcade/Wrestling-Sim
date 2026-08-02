import { expect, test } from "@playwright/test";

test("builds PWL Power Hour, inserts a special, and carries a grounded follow-up into the next episode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Promotion Calendar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Promotion Calendar, recurring show series, and the weekly booking pipeline" })).toBeVisible();

  await page.getByRole("button", { name: "Show Series", exact: true }).click();
  await page.getByRole("button", { name: "Create Weekly 60-Minute Series" }).first().click();
  await page.getByLabel("Show series name").fill("PWL Power Hour");
  await page.getByLabel("Show series company").fill("PWL");
  await page.getByLabel("Show series start date").fill("2026-08-03");
  await page.getByLabel("Show series weekday").selectOption("1");
  await page.getByLabel("Show series naming pattern").fill("{series} #{episode}");
  await page.getByLabel("Schedule generation count").fill("4");
  await page.getByRole("button", { name: "Preview New Episodes" }).click();
  await expect(page.locator(".promotion-preview-list > article")).toHaveCount(4);
  await expect(page.getByText("PWL Power Hour #1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create 4 New Shows" }).click();
  await expect(page.getByRole("status")).toContainText("4 shows created");

  await page.getByRole("button", { name: "Monthly Calendar" }).click();
  await page.getByLabel("Calendar special event name").fill("PWL Summer Spectacular");
  await page.getByLabel("Calendar special event date").fill("2026-08-29");
  await page.getByLabel("Calendar special event company").fill("PWL");
  await page.getByLabel("Calendar special event venue").fill("PWL Arena");
  await page.getByRole("button", { name: "Insert One-Off Event" }).click();
  await expect(page.getByRole("heading", { name: "PWL Summer Spectacular", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "PWL Power Hour #1", exact: false }).first().click();
  await page.getByLabel("Calendar reschedule date").fill("2026-08-05");
  await page.getByLabel("Calendar reschedule reason").fill("Television network scheduling change");
  await page.getByRole("button", { name: "Save Schedule Exception" }).click();
  await expect(page.getByRole("status")).toContainText("moved to 2026-08-05");

  await page.getByRole("button", { name: "Open Show Session" }).click();
  await expect(page.getByText("PWL Power Hour · Episode 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Return to Promotion Calendar" }).click();
  await expect(page.getByRole("heading", { name: "Promotion Calendar, recurring show series, and the weekly booking pipeline" })).toBeVisible();

  await page.evaluate(() => {
    const raw = window.localStorage.getItem("tew-story-tracker:planned-shows:v1");
    const shows = raw ? JSON.parse(raw) as Array<Record<string, unknown>> : [];
    const first = shows.find((show) => show.name === "PWL Power Hour #1") as Record<string, unknown> | undefined;
    if (!first) throw new Error("Generated first episode was not found.");
    first.status = "Reconciled";
    first.updatedAt = new Date().toISOString();
    first.segments = [{
      id: "follow-up-source-angle",
      type: "angle",
      section: "Main Show",
      title: "Opening Challenge",
      durationMinutes: 5,
      notes: "",
      workers: [],
      storylines: [],
      purpose: "",
      consequences: "",
      followUp: "The challenger signs the championship contract on the next episode.",
      privateNotes: "",
      matchType: "",
      championship: "",
      championshipId: "",
      championshipMatchPurpose: "",
      championEntering: "",
      challenger: "",
      expectedTitleChange: null,
      championshipStakes: "",
      titleResultDecision: "",
      titleResultConfirmedAt: "",
      plannedWinner: "",
      plannedFinish: "",
      matchStory: "",
      keyMoments: "",
      interference: "",
      postMatch: "",
      matchApproachSetup: {
        matchAimId: "call-it-in-the-ring",
        idealPace: 3,
        workerPlans: [],
        notes: "",
        performanceSettings: { authority: "tew-authoritative", volatility: 5, bookingInfluence: 0 },
        performancePreview: null,
        updatedAt: "",
      },
      competitionId: "",
      competitionFixtureId: "",
      competitionRoundLabel: "",
      angleLocation: "In The Ring",
      angleContentType: "Serious",
      segmentOutput: "The challenger issues the challenge.",
      audienceTakeaway: "",
      bookingIdeaId: "",
      workflowStatus: "Reconciled",
      reconciliation: {
        linkedMatchId: "",
        actualMatch: null,
        happenedAsPlanned: true,
        actualRating: null,
        finalNarrative: "The challenger issues the challenge.",
        changes: "",
        actualConsequences: "",
        finalFollowUp: "The challenger signs the championship contract on the next episode.",
        reconciledAt: new Date().toISOString(),
      },
    }];
    window.localStorage.setItem("tew-story-tracker:planned-shows:v1", JSON.stringify(shows));
  });

  await page.reload();
  await page.getByRole("button", { name: "Promotion Calendar", exact: true }).click();
  await page.getByRole("button", { name: "Monthly Calendar" }).click();
  await page.getByRole("button", { name: "PWL Power Hour #2", exact: false }).first().click();
  await page.getByRole("button", { name: "Booking Obligations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "PWL Power Hour #2" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Follow up: Opening Challenge" })).toBeVisible();
  const followUpCard = page.locator(".promotion-obligation-card").filter({ hasText: "Follow up: Opening Challenge" });
  await followUpCard.getByRole("button", { name: "Resolve" }).click();
  await followUpCard.getByRole("button", { name: "Add as Angle" }).click();
  await expect(page.getByRole("status")).toContainText("added as a grounded angle");

  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem("tew-story-tracker:planned-shows:v1");
    const shows = raw ? JSON.parse(raw) as Array<{ name?: string; segments?: Array<{ title?: string }> }> : [];
    return shows.find((show) => show.name === "PWL Power Hour #2")?.segments?.some((segment) => segment.title === "Follow up: Opening Challenge") ?? false;
  })).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "Promotion Calendar", exact: true }).click();
  await page.getByRole("button", { name: "Show Series", exact: true }).click();
  await expect(page.getByText("PWL Power Hour", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("4 generated shows", { exact: true })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem("tew-story-tracker:planned-shows:v1");
    return raw ? (JSON.parse(raw) as unknown[]).length : 0;
  })).toBe(5);
});
