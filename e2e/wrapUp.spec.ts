import { expect, test } from "@playwright/test";
import { createChampionship, createChampionshipReign } from "../src/championships/model";
import { createBookingIdea } from "../src/control/model";
import {
  createCompetitionParticipant,
  createCompetitionTemplate,
  generateCompetitionStructure,
} from "../src/competitions/model";
import { emptyOutputLibraryUniverse } from "../src/outputLibrary/model";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";
import { migrateShowsToPromotionSchedule } from "../src/schedule/model";
import {
  createShowSessionRecord,
  emptyShowSessionUniverse,
  upsertShowSessionRecord,
} from "../src/showSession/model";
import { createStorylineMilestone, createTrackerStoryline } from "../src/storylines/model";
import { createWorkerArc, createWorkerProfile } from "../src/workers/model";
import { openAdvancedTools } from "./helpers";

function buildWrapUpSeed(): Record<string, string> {
  const show1 = createPlannedShow(1);
  show1.id = "wrap-show-1";
  show1.name = "PWL Power Hour #1";
  show1.date = "2026-08-03";
  show1.company = "PWL";
  show1.venue = "PWL Arena";
  show1.status = "Reconciled";
  show1.reconciliation = {
    linkedShowId: "actual-show-1",
    actualShow: {
      id: "actual-show-1",
      name: "PWL Power Hour #1",
      date: "2026-08-03",
      rating: 82,
      attendance: 1400,
      venue: "PWL Arena",
      company: "PWL",
      broadcast: "Television",
      sourceFile: "TEW-post-show.mdb",
    },
    linkedAt: "2026-08-03T20:00:00.000Z",
    completedAt: "2026-08-03T22:00:00.000Z",
    notes: "Confirmed TEW show",
  };

  const title = createChampionship(1);
  title.id = "pwl-title";
  title.name = "PWL Championship";
  title.status = "Active";
  title.currentChampions = [{ id: "jay", name: "Jay White" }];
  title.dateWon = "2026-07-01";
  title.reigns = [createChampionshipReign(title.currentChampions, [], title.dateWon)];

  const titleMatch = createPlannedSegment("match");
  titleMatch.id = "title-match";
  titleMatch.title = "PWL Championship: Jay White vs PAC";
  titleMatch.matchStory = "PAC survives White's control and wins after a decisive counter.";
  titleMatch.workers = [
    { id: "jay", name: "Jay White", role: "Competitor", side: "Side 1", source: "manual" },
    { id: "pac", name: "PAC", role: "Competitor", side: "Side 2", source: "manual" },
  ];
  titleMatch.championshipId = title.id;
  titleMatch.championship = title.name;
  titleMatch.championEntering = "Jay White";
  titleMatch.challenger = "PAC";
  titleMatch.workflowStatus = "Reconciled";
  titleMatch.reconciliation.actualMatch = {
    id: "actual-title-match",
    description: "PAC defeated Jay White",
    rating: 88,
    winner: "PAC",
    matchTime: "22:14",
    notes: "PAC won cleanly.",
    placement: "Main Show",
    workers: ["Jay White", "PAC"],
  };
  titleMatch.reconciliation.actualRating = 88;
  titleMatch.reconciliation.finalNarrative = titleMatch.matchStory;
  titleMatch.reconciliation.reconciledAt = "2026-08-03T22:00:00.000Z";

  let competition = createCompetitionTemplate("world-classic");
  competition.participants = ["Bandido", "Brody King", "Ricochet", "Roderick Strong"].map((name, index) => createCompetitionParticipant(
    name,
    competition.participantType,
    { seed: index + 1, memberNames: [name] },
  ));
  competition = generateCompetitionStructure(competition);
  const fixture = competition.fixtures.find((item) => item.participantAId && item.participantBId);
  if (!fixture) throw new Error("The test competition did not create a playable fixture.");
  const fixtureWinner = competition.participants.find((item) => item.id === fixture.participantAId);
  if (!fixtureWinner) throw new Error("The test fixture winner could not be resolved.");

  const competitionMatch = createPlannedSegment("match");
  competitionMatch.id = "competition-match";
  competitionMatch.title = `${competition.name} ${fixture.roundLabel}`;
  competitionMatch.matchStory = `${fixtureWinner.name} wins a competitive tournament match.`;
  competitionMatch.competitionId = competition.id;
  competitionMatch.competitionFixtureId = fixture.id;
  competitionMatch.competitionRoundLabel = fixture.roundLabel;
  competitionMatch.workflowStatus = "Reconciled";
  competitionMatch.reconciliation.actualMatch = {
    id: "actual-competition-match",
    description: `${fixtureWinner.name} won the tournament match`,
    rating: 80,
    winner: fixtureWinner.name,
    matchTime: "15:32",
    notes: "Tournament result",
    placement: "Main Show",
    workers: [fixtureWinner.name],
  };
  competitionMatch.reconciliation.actualRating = 80;
  competitionMatch.reconciliation.finalNarrative = competitionMatch.matchStory;
  competitionMatch.reconciliation.reconciledAt = "2026-08-03T22:00:00.000Z";

  const angle = createPlannedSegment("angle");
  angle.id = "closing-angle";
  angle.title = "Closing Contract Challenge";
  angle.segmentOutput = "The new champion is challenged to sign a contract next week.";
  angle.followUp = "The new champion signs the championship contract on the next episode.";
  angle.workflowStatus = "Reconciled";

  show1.segments = [titleMatch, competitionMatch, angle];

  const show2 = createPlannedShow(2);
  show2.id = "wrap-show-2";
  show2.name = "PWL Power Hour #2";
  show2.date = "2026-08-10";
  show2.company = "PWL";
  show2.venue = "PWL Arena";

  const storyline = createTrackerStoryline(1);
  storyline.id = "world-title-story";
  storyline.name = "World Title Rivalry";
  storyline.status = "Active";
  const milestone = createStorylineMilestone(1);
  milestone.id = "contract-milestone";
  milestone.title = "Contract Challenge";
  milestone.assignedShowId = show1.id;
  milestone.status = "Assigned";
  storyline.milestones = [milestone];

  const idea = createBookingIdea(1);
  idea.id = "closing-idea";
  idea.title = "Closing Contract Challenge";
  idea.status = "Scheduled";
  idea.targetShowId = show1.id;
  idea.scheduledSegmentId = angle.id;

  const worker = createWorkerProfile(1);
  worker.id = "pac-worker";
  worker.displayName = "PAC";
  const arc = createWorkerArc(1);
  arc.id = "pac-arc";
  arc.name = "PAC Becomes Champion";
  arc.status = "Active";
  arc.targetShowId = show1.id;
  worker.arcs = [arc];

  const shows = [show1, show2];
  const schedule = migrateShowsToPromotionSchedule(shows);
  const sessionUniverse = upsertShowSessionRecord(emptyShowSessionUniverse(), {
    ...createShowSessionRecord(show1.id, titleMatch.id),
    activeStep: "overview",
  });

  return {
    "tew-story-tracker:planned-shows:v1": JSON.stringify(shows),
    "tew-story-tracker:championships:v1": JSON.stringify({ championships: [title] }),
    "tew-story-tracker:competitions:v1": JSON.stringify({ competitions: [competition] }),
    "tew-story-tracker:storylines:v1": JSON.stringify([storyline]),
    "tew-story-tracker:creative-control:v1": JSON.stringify({ ideas: [idea], settings: { dashboardWindowDays: 45, calendarFilter: "All", searchQuery: "" } }),
    "tew-story-tracker:workers:v1": JSON.stringify({ profiles: [worker], relationships: [] }),
    "tew-story-tracker:promotion-schedule:v1": JSON.stringify(schedule),
    "tew-story-tracker:show-session:v1": JSON.stringify(sessionUniverse),
    "tew-story-tracker:output-library:v1": JSON.stringify(emptyOutputLibraryUniverse()),
  };
}

test("closes a reconciled show, confirms consequences, rolls continuity forward, and restores backup version 20", async ({ page }) => {
  const seed = buildWrapUpSeed();
  await page.goto("/");
  await page.evaluate((values) => {
    window.localStorage.clear();
    Object.entries(values).forEach(([key, value]) => window.localStorage.setItem(key, value));
  }, seed);

  await page.reload();
  await expect(page.getByRole("button", { name: /Open Step 6: Wrap-Up/ })).toBeVisible();
  await page.getByRole("button", { name: /Open Step 6: Wrap-Up/ }).click();
  await expect(page.getByRole("heading", { name: "Close the creative loop after TEW has supplied the actual result" })).toBeVisible();

  for (const title of ["PWL Championship: Jay White vs PAC", "PWL World Classic Semifinal", "Closing Contract Challenge"]) {
    const card = page.locator(".wrap-up-review-card").filter({ hasText: title });
    if (title === "Closing Contract Challenge") {
      await card.getByLabel(`${title} happened as planned`).selectOption("Partially");
      await card.getByLabel(`${title} actual angle rating`).fill("76");
      await card.getByLabel(`${title} final narrative`).fill("The new champion accepted the challenge, but the contract signing was moved to next week.");
      await card.getByLabel(`${title} final follow-up`).fill("The new champion signs the championship contract on the next episode.");
    }
    await card.getByRole("button", { name: /Complete Final Record Review/ }).click();
    await expect(card.getByText("Reviewed", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: /Create Reconciled Actual Version/ }).click();
    await expect(card.getByText(/Output version:/)).toBeVisible();
  }

  await page.getByRole("button", { name: /Championships/ }).click();
  const titleDecision = page.locator(".wrap-up-decision-list > article").filter({ hasText: "PWL Championship" });
  await expect(titleDecision.getByText("PAC", { exact: true }).first()).toBeVisible();
  await titleDecision.getByRole("button", { name: "Confirm Championship Decision" }).click();
  await expect(titleDecision.getByText("Confirmed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Competitions/ }).click();
  const competitionDecision = page.locator(".wrap-up-decision-list > article").filter({ hasText: "PWL World Classic" });
  await competitionDecision.getByRole("button", { name: "Confirm Competition Result" }).click();
  await expect(competitionDecision.getByText("Confirmed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Continuity/ }).click();
  const milestoneCard = page.locator(".wrap-up-continuity-card").filter({ hasText: "Contract Challenge" }).first();
  await milestoneCard.getByLabel("Contract Challenge milestone decision").selectOption("Completed");
  await milestoneCard.getByRole("button", { name: "Confirm Milestone Decision" }).click();
  const ideaCard = page.locator(".wrap-up-continuity-card").filter({ hasText: "Closing Contract Challenge" });
  await ideaCard.getByLabel("Closing Contract Challenge idea decision").selectOption("Completed");
  await ideaCard.getByRole("button", { name: "Confirm Booking-Idea Decision" }).click();
  const arcCard = page.locator(".wrap-up-continuity-card").filter({ hasText: "PAC Becomes Champion" });
  await arcCard.getByLabel("PAC Becomes Champion arc decision").selectOption("Turning Point");
  await arcCard.getByLabel("PAC Becomes Champion progress note").fill("PAC won the PWL Championship and accepted the next challenge.");
  await arcCard.getByRole("button", { name: "Confirm Character-Arc Decision" }).click();

  await page.getByRole("button", { name: /Follow-Ups/ }).click();
  const followUp = page.locator(".wrap-up-decision-list > article").filter({ hasText: "Closing Contract Challenge" });
  await followUp.getByLabel("Closing Contract Challenge follow-up destination").selectOption("New Angle");
  await followUp.getByLabel("Closing Contract Challenge follow-up target show").selectOption("wrap-show-2");
  await followUp.getByRole("button", { name: "Confirm Follow-Up Decision" }).click();
  await expect(followUp.getByText("Confirmed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Show Closure" }).click();
  await expect(page.getByRole("button", { name: "Close Wrap-Up and Generate Report" })).toBeEnabled();
  await page.getByRole("button", { name: "Close Wrap-Up and Generate Report" }).click();
  await expect(page.getByText("SHOW CLOSURE REPORT: PWL Power Hour #1", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Close Wrap-Up and Open Next Scheduled Show" }).click();
  await expect(page.getByLabel("Show session planned show").locator("option:checked")).toContainText("PWL Power Hour #2");

  await expect.poll(async () => page.evaluate(() => {
    const shows = JSON.parse(window.localStorage.getItem("tew-story-tracker:planned-shows:v1") || "[]") as Array<{ id: string; segments: Array<{ title: string }> }>;
    return shows.find((show) => show.id === "wrap-show-2")?.segments.some((segment) => segment.title === "Follow up: Closing Contract Challenge") ?? false;
  })).toBe(true);

  const serializedBackup = await page.evaluate(() => {
    const read = (key: string, fallback: unknown): unknown => {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) as unknown : fallback;
    };
    return JSON.stringify({
      product: "TEW IX Story Tracker",
      version: 20,
      exportedAt: new Date().toISOString(),
      shows: read("tew-story-tracker:planned-shows:v1", []),
      storylines: read("tew-story-tracker:storylines:v1", []),
      workers: read("tew-story-tracker:workers:v1", {}),
      control: read("tew-story-tracker:creative-control:v1", {}),
      championships: read("tew-story-tracker:championships:v1", {}),
      handoff: read("tew-story-tracker:handoff:v1", {}),
      matchEngine: read("tew-story-tracker:match-engine:v1", {}),
      competitions: read("tew-story-tracker:competitions:v1", {}),
      bridge: read("tew-story-tracker:bridge:v1", {}),
      transfer: read("tew-story-tracker:transfer:v1", {}),
      operations: read("tew-story-tracker:show-operations:v1", {}),
      workbench: read("tew-story-tracker:workbench:v1", {}),
      profileLibrary: read("tew-story-tracker:profile-library:v1", {}),
      outputLibrary: read("tew-story-tracker:output-library:v1", {}),
      showSession: read("tew-story-tracker:show-session:v1", {}),
      promotionSchedule: read("tew-story-tracker:promotion-schedule:v1", {}),
      wrapUp: read("tew-story-tracker:wrap-up:v1", {}),
    });
  });

  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await openAdvancedTools(page);
  await page.getByRole("button", { name: "Planned Shows", exact: true }).click();
  await page.locator('input[type="file"][accept*="application/json"]').setInputFiles({
    name: "tew-story-tracker-version-20.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializedBackup),
  });
  await expect(page.getByRole("status")).toContainText("Imported 2 planned shows");

  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem("tew-story-tracker:wrap-up:v1");
    const data = raw ? JSON.parse(raw) as { sessions?: Array<{ showId?: string; status?: string; closureReports?: unknown[] }> } : {};
    const session = data.sessions?.find((item) => item.showId === "wrap-show-1");
    return `${session?.status ?? ""}:${session?.closureReports?.length ?? 0}`;
  })).toBe("Closed:1");
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem("tew-story-tracker:championships:v1");
    const data = raw ? JSON.parse(raw) as { championships?: Array<{ currentChampions?: Array<{ name?: string }> }> } : {};
    return data.championships?.[0]?.currentChampions?.map((item) => item.name).join(" & ") ?? "";
  })).toBe("PAC");
});
