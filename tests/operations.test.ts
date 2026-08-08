import { describe, expect, test } from "vitest";
import { emptyHandoffUniverse } from "../src/handoff/storage";
import { createMatchEngineProfile } from "../src/matchEngine/model";
import {
  applyConfirmedResultLinks,
  buildResultIntakeSession,
  buildShowOperationsSummary,
  buildShowPreflight,
  createOperationsChangeNote,
  emptyShowOperationsUniverse,
} from "../src/operations/model";
import { parseShowOperationsUniverse } from "../src/operations/storage";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";
import type { TewSnapshot } from "../src/tew/types";
import { emptyTransferUniverse } from "../src/transfer/model";

function snapshot(): TewSnapshot {
  return {
    fileName: "post-show.mdb",
    fileSize: 100,
    databaseCreatedAt: "2026-08-01T00:00:00.000Z",
    importedAt: "2026-08-02T00:00:00.000Z",
    tables: [{ name: "Shows", rowCount: 1, columnCount: 3, columns: ["ID", "Name", "Date"], loaded: true, truncated: false }],
    workers: [
      { id: "w1", name: "Jay White", role: "", side: "" },
      { id: "w2", name: "PAC", role: "", side: "" },
    ],
    shows: [{
      id: "actual-show",
      name: "PWL Fusion",
      date: "2026-08-15",
      rating: 82,
      attendance: 4000,
      venue: "PWL Arena",
      company: "PWL",
      broadcast: "PWL Network",
      matches: [{
        id: "actual-match",
        showId: "actual-show",
        description: "Jay White vs PAC",
        rating: 84,
        winner: "Jay White",
        matchTime: "18 minutes",
        notes: "Blade Runner finish",
        placement: "Main Show",
        workers: [
          { id: "w1", name: "Jay White", role: "Competitor", side: "Side 1" },
          { id: "w2", name: "PAC", role: "Competitor", side: "Side 2" },
        ],
      }],
    }],
    storylines: [],
    diagnostics: { matchedTables: {}, warnings: [], orphanMatchCount: 0, unresolvedWorkerCount: 0 },
  };
}

function completeShow() {
  const show = createPlannedShow(1);
  show.name = "PWL Fusion";
  show.date = "2026-08-15";
  show.company = "PWL";
  show.venue = "PWL Arena";
  show.expectedMinutes = 18;
  const match = createPlannedSegment("match");
  match.title = "Jay White vs PAC";
  match.durationMinutes = 18;
  match.matchType = "1 vs. 1";
  match.plannedWinner = "Jay White";
  match.plannedFinish = "Pinfall after Blade Runner";
  match.matchStory = "PAC controls the pace before White creates the decisive opening.";
  match.workers = [
    { id: "w1", name: "Jay White", role: "Competitor", side: "Side 1", source: "tew" },
    { id: "w2", name: "PAC", role: "Competitor", side: "Side 2", source: "tew" },
  ];
  match.matchApproachSetup.workerPlans = [
    { workerKey: "tew:w1", workerName: "Jay White", selectedApproachIds: ["psychological-manipulator", "opportunistic-schemer", "big-match-performer"], lockedApproachIds: [], mode: "AI", generatedAt: "2026-08-01T00:00:00.000Z" },
    { workerKey: "tew:w2", workerName: "PAC", selectedApproachIds: ["aerial-showstopper", "high-tempo-hybrid", "resilient-underdog"], lockedApproachIds: [], mode: "AI", generatedAt: "2026-08-01T00:00:00.000Z" },
  ];
  show.segments = [match];
  return show;
}

describe("Phase 5C unified show operations", () => {
  test("identifies blocking creative issues and creates guided actions", () => {
    const show = createPlannedShow(1);
    const report = buildShowPreflight(show, emptyHandoffUniverse(), emptyTransferUniverse());
    expect(report.blockingCount).toBeGreaterThan(0);
    expect(report.issues.some((issue) => issue.actionTarget === "show")).toBe(true);
    expect(report.score).toBeLessThan(100);
  });

  test("recognizes a creatively complete card and derives the next operational stage", () => {
    const show = completeShow();
    const handoff = emptyHandoffUniverse();
    const transfer = emptyTransferUniverse();
    const report = buildShowPreflight(show, handoff, transfer);
    expect(report.blockingCount).toBe(0);
    expect(report.importantCount).toBe(0);
    const summary = buildShowOperationsSummary(show, handoff, transfer, report, null);
    expect(summary.stage).toBe("Creative Ready");
    expect(summary.approachesComplete).toBe(1);
    expect(summary.narrativesComplete).toBe(1);
    expect(summary.nextActionTarget).toBe("handoff");
  });

  test("uses the custom approach limit and each wrestler's actual stamina capacity in preflight", () => {
    const show = completeShow();
    const match = show.segments[0];
    match.matchApproachSetup.approachLimit = 2;
    match.matchApproachSetup.workerPlans.forEach((plan) => { plan.selectedApproachIds = ["aerial-showstopper", "high-tempo-hybrid"]; });
    const profiles = match.workers.map((worker) => {
      const profile = createMatchEngineProfile(worker);
      profile.experience = 10;
      profile.skills.Selling = 10;
      profile.skills.Stamina = 10;
      profile.skills.Resilience = 10;
      profile.skills.Athleticism = 10;
      profile.skills.Toughness = 10;
      return profile;
    });
    const report = buildShowPreflight(show, emptyHandoffUniverse(), emptyTransferUniverse(), [], profiles);
    expect(report.issues.some((issue) => issue.id.includes("approach-count"))).toBe(false);
    expect(report.issues.filter((issue) => issue.id.includes("stamina-")).length).toBe(2);
    expect(report.issues.find((issue) => issue.id.includes("stamina-"))?.detail).toContain("Match load 66/10 endurance");
  });

  test("matches planned results to TEW history and applies only confirmed links", () => {
    const show = completeShow();
    const session = buildResultIntakeSession(show, snapshot());
    expect(session).not.toBeNull();
    expect(session?.actualShowId).toBe("actual-show");
    expect(session?.suggestions[0].confidence).toBeGreaterThanOrEqual(70);
    if (!session) throw new Error("Result session was not created");
    session.suggestions[0].status = "Confirmed";
    const updated = applyConfirmedResultLinks(show, session, snapshot());
    expect(updated.status).toBe("Completed");
    expect(updated.reconciliation?.linkedShowId).toBe("actual-show");
    expect(updated.segments[0].reconciliation.linkedMatchId).toBe("actual-match");
    expect(updated.segments[0].reconciliation.actualRating).toBe(84);
    expect(updated.segments[0].reconciliation.happenedAsPlanned).toBe(true);
  });

  test("preserves acknowledgements change notes and result sessions", () => {
    const show = completeShow();
    const session = buildResultIntakeSession(show, snapshot());
    const note = createOperationsChangeNote({
      showId: show.id,
      segmentId: show.segments[0].id,
      field: "Duration",
      originalValue: "18",
      enteredValue: "16",
      reason: "TEW broadcast limit",
      updateCreativePlan: true,
      requiresNewVersion: true,
    });
    const parsed = parseShowOperationsUniverse({ records: [{
      showId: show.id,
      acknowledgedIssueIds: ["issue-1"],
      changeNotes: [note],
      resultSessions: session ? [session] : [],
      lastViewedTab: "changes",
      updatedAt: "2026-08-02T00:00:00.000Z",
    }] });
    expect(parsed.records[0].acknowledgedIssueIds).toEqual(["issue-1"]);
    expect(parsed.records[0].changeNotes[0].requiresNewVersion).toBe(true);
    expect(parsed.records[0].lastViewedTab).toBe("changes");
    expect(emptyShowOperationsUniverse()).toEqual({ records: [] });
  });
});
