import { describe, expect, test } from "vitest";
import { emptyBridgeUniverse } from "../src/bridge/model";
import { emptyChampionshipUniverse } from "../src/championships/storage";
import { emptyCompetitionUniverse } from "../src/competitions/model";
import { emptyCreativeControlData } from "../src/control/storage";
import { emptyHandoffUniverse } from "../src/handoff/storage";
import { emptyMatchEngineUniverse } from "../src/matchEngine/storage";
import { emptyShowOperationsUniverse } from "../src/operations/model";
import { emptyOutputLibraryUniverse } from "../src/outputLibrary/model";
import {
  buildTewEntrySummary,
  createPlannedSegment,
  createPlannedShow,
  duplicatePlannedShow,
  movePlannedSegment,
  totalPlannedMinutes,
} from "../src/planner/model";
import {
  PLANNER_STORAGE_KEY,
  createPlannerBackup,
  loadPlannedShows,
  parsePlannerBackup,
  parsePlannerBackupBundle,
  savePlannedShows,
} from "../src/planner/storage";
import { emptyProfileLibraryUniverse } from "../src/profileLibrary/model";
import { emptyPromotionScheduleUniverse } from "../src/schedule/model";
import { emptyShowSessionUniverse } from "../src/showSession/model";
import { emptyTransferUniverse } from "../src/transfer/model";
import { emptyWorkbenchUniverse } from "../src/workbench/model";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function addAdvisoryPreview(match: ReturnType<typeof createPlannedSegment>): void {
  match.matchApproachSetup.performancePreview = {
    id: "preview-1",
    generatedAt: "2026-08-01T00:00:00.000Z",
    seed: "test-night",
    authority: "tew-authoritative",
    matchScore: 80,
    starRating: 4,
    performanceLeaderKey: "tew:1",
    performanceLeaderName: "Bret Hart",
    projectedWinnerKey: "",
    projectedWinnerName: "",
    confidence: 0,
    summary: "TEW remains authoritative. Bret Hart has the strongest advisory performance profile.",
    workerResults: [{
      workerKey: "tew:1",
      workerName: "Bret Hart",
      mentalStateId: "focused",
      mentalStateName: "FOCUSED",
      mentalStateScore: 74,
      mentalModifier: 2.5,
      luck: 1,
      swing: 0,
      consistencyVariance: 0.5,
      averageApproachRating: 82,
      approachExecution: 84,
      presentationScore: 78,
      staminaStatus: "PASS",
      staminaModifier: 2,
      paceStatus: "IDEAL PACE",
      paceModifier: 2,
      performanceScore: 82.8,
      competitiveScore: 82.4,
      winProbability: 1,
    }],
  };
}

describe("planned show workspace", () => {
  test("creates rich match and angle defaults and calculates card time", () => {
    const show = createPlannedShow(1);
    const match = createPlannedSegment("match");
    const angle = createPlannedSegment("angle");
    show.segments = [match, angle];

    expect(show.name).toBe("Untitled Show 1");
    expect(show.reconciliation).toBeNull();
    expect(match).toMatchObject({
      title: "Untitled Match",
      matchType: "1 vs. 1",
      matchStory: "",
      workers: [],
      storylines: [],
      workflowStatus: "Planned",
      competitionId: "",
      matchApproachSetup: {
        matchAimId: "call-it-in-the-ring",
        workerPlans: [],
        notes: "",
        performanceSettings: { authority: "tew-authoritative", volatility: 5, bookingInfluence: 0 },
        performancePreview: null,
      },
    });
    expect(angle).toMatchObject({
      title: "Untitled Angle",
      angleLocation: "In The Ring",
      angleContentType: "Serious",
      segmentOutput: "",
      workflowStatus: "Planned",
    });
    expect(totalPlannedMinutes(show)).toBe(17);
  });

  test("builds a copy-ready TEW summary with competition title approach and advisory preview details", () => {
    const match = createPlannedSegment("match");
    match.title = "World Title Match";
    match.competitionId = "classic-1";
    match.competitionFixtureId = "fixture-1";
    match.competitionRoundLabel = "Semifinal";
    match.championship = "PWL Championship";
    match.championshipMatchPurpose = "Defense";
    match.championEntering = "Bret Hart";
    match.challenger = "Shawn Michaels";
    match.expectedTitleChange = false;
    match.plannedWinner = "Bret Hart";
    match.plannedFinish = "Submission";
    match.matchStory = "Bret targets the knee and wins with the Sharpshooter.";
    match.workers = [{ id: "1", name: "Bret Hart", role: "Competitor", side: "Side 1", source: "tew" }];
    match.matchApproachSetup.matchAimId = "technical-showcase";
    match.matchApproachSetup.notes = "Keep the limb work central to the TEW road-agent notes.";
    match.matchApproachSetup.workerPlans = [{
      workerKey: "tew:1",
      workerName: "Bret Hart",
      selectedApproachIds: ["chain-technician", "submission-specialist"],
      lockedApproachIds: ["submission-specialist"],
      mode: "AI",
      generatedAt: "2026-08-01T00:00:00.000Z",
    }];
    addAdvisoryPreview(match);

    const summary = buildTewEntrySummary(match);
    expect(summary).toContain("Competition fixture: Semifinal");
    expect(summary).toContain("Championship: PWL Championship");
    expect(summary).toContain("Expected title change: No");
    expect(summary).toContain("Match aim: Technical Showcase");
    expect(summary).toContain("Bret Hart: Chain Technician, Submission Specialist");
    expect(summary).toContain("Tracker performance preview — advisory only: 80.0/100 · 4★");
    expect(summary).toContain("TEW remains authoritative");
    expect(summary).toContain("Bret targets the knee");
  });

  test("moves segments without allowing them outside the card", () => {
    const first = createPlannedSegment("angle");
    const second = createPlannedSegment("match");
    const original = [first, second];
    expect(movePlannedSegment(original, second.id, -1).map((item) => item.id)).toEqual([second.id, first.id]);
    expect(movePlannedSegment(original, first.id, -1)).toBe(original);
  });

  test("duplicates shows retaining creative strategy but clearing results and competition links", () => {
    const show = createPlannedShow(1);
    const match = createPlannedSegment("match");
    match.workers = [{ id: "worker-1", name: "Worker One", role: "Competitor", side: "Side 1", source: "tew" }];
    match.workflowStatus = "Reconciled";
    match.bookingIdeaId = "idea-1";
    match.competitionId = "competition-1";
    match.competitionFixtureId = "fixture-1";
    match.competitionRoundLabel = "Final";
    match.titleResultDecision = "Retained";
    match.titleResultConfirmedAt = "2026-08-01T00:00:00.000Z";
    match.reconciliation.linkedMatchId = "actual-1";
    match.matchApproachSetup.workerPlans = [{
      workerKey: "tew:worker-1",
      workerName: "Worker One",
      selectedApproachIds: ["pace-controller"],
      lockedApproachIds: ["pace-controller"],
      mode: "AI",
      generatedAt: "2026-08-01T00:00:00.000Z",
    }];
    addAdvisoryPreview(match);
    show.segments = [match, createPlannedSegment("angle")];

    const duplicate = duplicatePlannedShow(show);
    expect(duplicate.id).not.toBe(show.id);
    expect(duplicate.name).toBe(`${show.name} Copy`);
    expect(duplicate.reconciliation).toBeNull();
    expect(duplicate.segments[0].id).not.toBe(match.id);
    expect(duplicate.segments[0].workflowStatus).toBe("Planned");
    expect(duplicate.segments[0].bookingIdeaId).toBe("");
    expect(duplicate.segments[0].competitionId).toBe("");
    expect(duplicate.segments[0].titleResultDecision).toBe("");
    expect(duplicate.segments[0].reconciliation.actualMatch).toBeNull();
    expect(duplicate.segments[0].matchApproachSetup.workerPlans[0]).toMatchObject({
      selectedApproachIds: ["pace-controller"],
      lockedApproachIds: ["pace-controller"],
      generatedAt: "",
    });
    expect(duplicate.segments[0].matchApproachSetup.performancePreview).toBeNull();
  });

  test("saves loads exports and imports Phase 5H Promotion Calendar data", () => {
    const storage = new MemoryStorage();
    const show = createPlannedShow(1);
    const match = createPlannedSegment("match");
    match.matchStory = "A complete match story.";
    addAdvisoryPreview(match);
    show.segments = [match];
    savePlannedShows(storage, [show]);
    expect(loadPlannedShows(storage)).toEqual([show]);

    const workers = { profiles: [], relationships: [] };
    const control = emptyCreativeControlData();
    const championships = emptyChampionshipUniverse();
    const handoff = emptyHandoffUniverse();
    const matchEngine = emptyMatchEngineUniverse();
    const competitions = emptyCompetitionUniverse();
    const bridge = emptyBridgeUniverse();
    const transfer = emptyTransferUniverse();
    const operations = emptyShowOperationsUniverse();
    const workbench = emptyWorkbenchUniverse();
    const profileLibrary = emptyProfileLibraryUniverse();
    const outputLibrary = emptyOutputLibraryUniverse();
    const showSession = emptyShowSessionUniverse();
    const promotionSchedule = emptyPromotionScheduleUniverse();
    const backup = createPlannerBackup(
      [show],
      [],
      workers,
      control,
      championships,
      handoff,
      matchEngine,
      competitions,
      bridge,
      transfer,
      operations,
      workbench,
      profileLibrary,
      outputLibrary,
      showSession,
      promotionSchedule,
    );

    expect(backup.version).toBe(19);
    expect(backup.workbench).toEqual(workbench);
    expect(backup.profileLibrary).toEqual(profileLibrary);
    expect(backup.outputLibrary).toEqual(outputLibrary);
    expect(backup.showSession).toEqual(showSession);
    expect(backup.promotionSchedule).toEqual(promotionSchedule);
    expect(parsePlannerBackup(JSON.stringify(backup))).toEqual([show]);
    expect(parsePlannerBackupBundle(JSON.stringify(backup))).toEqual({
      shows: [show],
      storylines: [],
      workers,
      control,
      championships,
      handoff,
      matchEngine,
      competitions,
      bridge,
      transfer,
      operations,
      workbench,
      profileLibrary,
      outputLibrary,
      showSession,
      promotionSchedule,
    });
  });

  test("migrates version 18 shows into one-off schedule links without losing cards", () => {
    const show = createPlannedShow(1);
    show.name = "Legacy Scheduled Show";
    const version18 = {
      product: "TEW IX Story Tracker",
      version: 18,
      exportedAt: "2026-08-01T00:00:00.000Z",
      shows: [show],
      storylines: [],
      workers: { profiles: [], relationships: [] },
      control: emptyCreativeControlData(),
      championships: emptyChampionshipUniverse(),
      handoff: emptyHandoffUniverse(),
      matchEngine: emptyMatchEngineUniverse(),
      competitions: emptyCompetitionUniverse(),
      bridge: emptyBridgeUniverse(),
      transfer: emptyTransferUniverse(),
      operations: emptyShowOperationsUniverse(),
      workbench: emptyWorkbenchUniverse(),
      profileLibrary: emptyProfileLibraryUniverse(),
      outputLibrary: emptyOutputLibraryUniverse(),
      showSession: emptyShowSessionUniverse(),
    };
    const parsed = parsePlannerBackupBundle(JSON.stringify(version18));
    expect(parsed.shows[0].name).toBe("Legacy Scheduled Show");
    expect(parsed.promotionSchedule.links[0]).toMatchObject({ showId: show.id, seriesId: "", episodeNumber: 0 });
  });

  test("migrates Phase 2A planned shows without losing the card", () => {
    const storage = new MemoryStorage();
    storage.setItem(PLANNER_STORAGE_KEY, JSON.stringify([{
      id: "show-1",
      name: "Legacy Planned Show",
      date: "2026-08-01",
      company: "AEW",
      showType: "Television",
      venue: "Arena",
      expectedMinutes: 120,
      status: "Draft",
      notes: "Legacy notes",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      segments: [{ id: "segment-1", type: "angle", section: "Main Show", title: "Opening Promo", durationMinutes: 5, notes: "Basic outline" }],
    }]));

    const [show] = loadPlannedShows(storage);
    expect(show.name).toBe("Legacy Planned Show");
    expect(show.reconciliation).toBeNull();
    expect(show.segments[0]).toMatchObject({
      title: "Opening Promo",
      segmentOutput: "",
      workers: [],
      storylines: [],
      workflowStatus: "Planned",
      competitionId: "",
      matchApproachSetup: {
        matchAimId: "call-it-in-the-ring",
        workerPlans: [],
        performanceSettings: { authority: "tew-authoritative" },
        performancePreview: null,
      },
    });
  });

  test("accepts versions 1 through 19 and rejects future unsupported versions", () => {
    for (let version = 1; version <= 18; version += 1) {
      expect(parsePlannerBackup(JSON.stringify({ product: "TEW IX Story Tracker", version, shows: [] }))).toEqual([]);
    }
    const version19 = createPlannerBackup([], [], { profiles: [], relationships: [] }, emptyCreativeControlData(), emptyChampionshipUniverse(), emptyHandoffUniverse(), emptyMatchEngineUniverse(), emptyCompetitionUniverse(), emptyBridgeUniverse(), emptyTransferUniverse(), emptyShowOperationsUniverse(), emptyWorkbenchUniverse(), emptyProfileLibraryUniverse(), emptyOutputLibraryUniverse(), emptyShowSessionUniverse(), emptyPromotionScheduleUniverse());
    expect(parsePlannerBackup(JSON.stringify(version19))).toEqual([]);
    expect(() => parsePlannerBackup('{"product":"TEW IX Story Tracker","version":20,"shows":[]}')).toThrow("not a supported TEW Story Tracker backup");
  });
});
