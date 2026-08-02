import { describe, expect, test } from "vitest";
import {
  buildBridgeDryRun,
  buildBridgeReadiness,
  buildCompanionWorkflow,
  compareTewSnapshots,
  emptyBridgeUniverse,
} from "../src/bridge/model";
import { loadBridgeUniverse, saveBridgeUniverse } from "../src/bridge/storage";
import { emptyHandoffUniverse } from "../src/handoff/storage";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";
import type { TewSnapshot } from "../src/tew/types";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function snapshot(fileName: string, after = false): TewSnapshot {
  return {
    fileName,
    fileSize: after ? 1100 : 1000,
    databaseCreatedAt: "",
    importedAt: after ? "2026-08-02T01:00:00.000Z" : "2026-08-02T00:00:00.000Z",
    tables: [
      { name: "tblShows", rowCount: after ? 11 : 10, columnCount: 8, columns: ["UID", "Name"], loaded: true, truncated: false },
      { name: "tblWorkers", rowCount: 30, columnCount: 5, columns: ["UID", "Name"], loaded: true, truncated: false },
    ],
    workers: [{ id: "worker-1", name: "Jay White", role: "", side: "" }],
    shows: after ? [{
      id: "show-1",
      name: "PWL Collision",
      date: "2026-08-02",
      rating: 82,
      attendance: 5000,
      venue: "Arena",
      company: "PWL",
      broadcast: "TV",
      matches: [{ id: "match-1", showId: "show-1", description: "Jay White vs PAC", rating: 84, winner: "Jay White", matchTime: "18:00", notes: "", placement: "Main Show", workers: [{ id: "worker-1", name: "Jay White", role: "", side: "" }] }],
    }] : [],
    storylines: after ? [{ id: "story-1", name: "World Title Chase", description: "", status: "Active", heat: 70, workers: [], sourceTable: "tblStorylines" }] : [],
    diagnostics: { matchedTables: { shows: "tblShows" }, warnings: [], orphanMatchCount: 0, unresolvedWorkerCount: 0 },
  };
}

describe("TEW companion bridge", () => {
  test("compares read-only snapshots and identifies table and entity changes", () => {
    const report = compareTewSnapshots(snapshot("before.mdb"), snapshot("after.mdb", true));
    expect(report.beforeFileName).toBe("before.mdb");
    expect(report.afterFileName).toBe("after.mdb");
    expect(report.tableChanges.find((change) => change.tableName === "tblShows")).toMatchObject({ rowDelta: 1, classification: "Rows Added" });
    expect(report.entityChanges.some((change) => change.entityType === "Show" && change.changeType === "Added")).toBe(true);
    expect(report.entityChanges.some((change) => change.entityType === "Match" && change.changeType === "Added")).toBe(true);
    expect(report.candidateTables).toContain("tblShows");
  });

  test("builds a mapping-based readiness report and non-writing dry-run package", () => {
    const show = createPlannedShow(1);
    show.name = "PWL Collision";
    show.company = "PWL";
    show.venue = "Arena";
    const match = createPlannedSegment("match");
    match.title = "Jay White vs PAC";
    match.plannedWinner = "Jay White";
    match.plannedFinish = "Pinfall";
    match.matchStory = "Jay White controls the pace and wins after countering PAC.";
    match.workers = [
      { id: "jay", name: "Jay White", role: "Competitor", side: "Side 1", source: "manual" },
      { id: "pac", name: "PAC", role: "Competitor", side: "Side 2", source: "manual" },
    ];
    show.segments = [match];
    const universe = emptyBridgeUniverse();
    const showNameMapping = universe.mappings.find((mapping) => mapping.category === "Show" && mapping.trackerField === "name");
    expect(showNameMapping).toBeDefined();
    Object.assign(showNameMapping!, { status: "Verified", confidence: "High", tewTable: "tblShows", tewField: "Name", evidence: "Confirmed by repeated before/after comparison." });
    const readiness = buildBridgeReadiness(show, universe.mappings);
    expect(readiness.verifiedCount).toBeGreaterThan(0);
    expect(readiness.fields.find((field) => field.label === "Show name")?.status).toBe("Verified");
    const dryRun = buildBridgeDryRun(show, universe.mappings);
    expect(dryRun.writingEnabled).toBe(false);
    expect(dryRun.readyCount).toBeGreaterThan(0);
    expect(dryRun.proposedChanges.find((change) => change.targetTable === "tblShows")).toMatchObject({ targetField: "Name", validation: "Ready" });
  });

  test("tracks the guided TEW companion workflow without replacing TEW", () => {
    const show = createPlannedShow(1);
    const match = createPlannedSegment("match");
    match.matchStory = "Complete story";
    match.matchApproachSetup.workerPlans = [{ workerKey: "manual:jay", workerName: "Jay White", selectedApproachIds: ["psychological-manipulator"], lockedApproachIds: [], mode: "Manual", generatedAt: "" }];
    show.segments = [match];
    const workflow = buildCompanionWorkflow(show, emptyHandoffUniverse());
    expect(workflow.find((step) => step.id === "card")?.status).toBe("Complete");
    expect(workflow.find((step) => step.id === "approaches")?.status).toBe("Complete");
    expect(workflow.find((step) => step.id === "run")?.detail).toContain("TEW remains authoritative");
    expect(workflow.find((step) => step.id === "handoff")?.status).toBe("Current");
  });

  test("persists companion settings mappings and comparison history", () => {
    const storage = new MemoryStorage();
    const universe = emptyBridgeUniverse();
    universe.settings.advancedPreviewTools = true;
    universe.comparisonReports = [compareTewSnapshots(snapshot("before.mdb"), snapshot("after.mdb", true))];
    saveBridgeUniverse(storage, universe);
    expect(loadBridgeUniverse(storage)).toEqual(universe);
  });
});
