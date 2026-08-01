import { describe, expect, test } from "vitest";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";
import { createTrackerStoryline } from "../src/storylines/model";
import {
  buildWorkerHistory,
  buildWorkerWarnings,
  calculateWorkerStatistics,
  compareWorkers,
  createWorkerArc,
  createWorkerProfile,
  createWorkerRelationship,
  discoverWorkerCandidates,
} from "../src/workers/model";
import { loadWorkerUniverse, saveWorkerUniverse } from "../src/workers/storage";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("worker creative profiles", () => {
  test("discovers and deduplicates workers from TEW, shows, and storylines", () => {
    const show = createPlannedShow(1);
    show.company = "PWL";
    const match = createPlannedSegment("match");
    match.workers = [{ id: "tew-1", name: "Bret Hart", role: "Competitor", side: "A", source: "tew" }];
    show.segments = [match];
    const storyline = createTrackerStoryline(1);
    storyline.participants = [{ id: "manual-1", name: "Bret Hart", role: "Protagonist", source: "manual" }];
    const snapshot = {
      fileName: "TEW.mdb", fileSize: 1, databaseCreatedAt: "", importedAt: "", tables: [], shows: [], storylines: [],
      workers: [{ id: "tew-1", name: "Bret Hart", role: "Wrestler", side: "" }],
      diagnostics: { matchedTables: {}, warnings: [], orphanMatchCount: 0, unresolvedWorkerCount: 0 },
    };
    const candidates = discoverWorkerCandidates([show], [storyline], snapshot);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ name: "Bret Hart", source: "tew", tewWorkerId: "tew-1", appearanceCount: 1 });
    expect(candidates[0].roles).toContain("Protagonist");
  });

  test("builds creative history and calculates grounded statistics", () => {
    const worker = createWorkerProfile(1);
    worker.displayName = "Bret Hart";
    const show = createPlannedShow(1);
    show.name = "PWL One";
    show.date = "2026-07-01";
    show.status = "Reconciled";
    const match = createPlannedSegment("match");
    match.title = "Bret vs Shawn";
    match.workers = [{ id: "bret", name: "Bret Hart", role: "Competitor", side: "A", source: "manual" }];
    match.storylines = [{ id: "story", name: "World Title Rivalry", source: "manual" }];
    match.workflowStatus = "Reconciled";
    match.reconciliation.actualMatch = {
      id: "actual", description: "Bret Hart defeated Shawn Michaels", rating: 88, winner: "Bret Hart",
      matchTime: "20:00", notes: "", placement: "Main Show", workers: ["Bret Hart", "Shawn Michaels"],
    };
    show.segments = [match];
    const history = buildWorkerHistory(worker, [show]);
    const stats = calculateWorkerStatistics(history, "2026-08-01");
    expect(history).toHaveLength(1);
    expect(history[0].winState).toBe("Win");
    expect(stats).toMatchObject({ completedAppearances: 1, matches: 1, wins: 1, losses: 0, averageMatchRating: 88, storylines: 1, daysSinceLastAppearance: 31 });
  });

  test("compares workers and resolves their relationship", () => {
    const bret = createWorkerProfile(1); bret.displayName = "Bret Hart";
    const shawn = createWorkerProfile(2); shawn.displayName = "Shawn Michaels";
    const show = createPlannedShow(1); show.date = "2026-07-01"; show.status = "Reconciled";
    const match = createPlannedSegment("match");
    match.workers = [
      { id: "bret", name: "Bret Hart", role: "Competitor", side: "A", source: "manual" },
      { id: "shawn", name: "Shawn Michaels", role: "Competitor", side: "B", source: "manual" },
    ];
    match.workflowStatus = "Reconciled";
    match.reconciliation.actualMatch = { id: "m", description: "Bret won", rating: 90, winner: "Bret Hart", matchTime: "25:00", notes: "", placement: "Main Show", workers: ["Bret Hart", "Shawn Michaels"] };
    show.segments = [match];
    const relationship = createWorkerRelationship(bret.id, shawn.id);
    relationship.type = "Rival";
    const comparison = compareWorkers(bret, shawn, [show], [relationship]);
    expect(comparison.sharedEntries).toHaveLength(1);
    expect(comparison.workerAWins).toBe(1);
    expect(comparison.workerBWins).toBe(0);
    expect(comparison.relationship?.type).toBe("Rival");
  });

  test("warns about missing booking, arc next steps, and duplicate TEW records", () => {
    const profile = createWorkerProfile(1);
    profile.displayName = "Bret Hart";
    profile.source = "manual";
    const arc = createWorkerArc(1);
    arc.status = "Active";
    profile.arcs = [arc];
    const storyline = createTrackerStoryline(1);
    storyline.status = "Active";
    storyline.participants = [{ id: "1", name: "Bret Hart", role: "Protagonist", source: "manual" }];
    const snapshot = {
      fileName: "TEW.mdb", fileSize: 1, databaseCreatedAt: "", importedAt: "", tables: [], shows: [], storylines: [],
      workers: [{ id: "tew-1", name: "Bret Hart", role: "Wrestler", side: "" }],
      diagnostics: { matchedTables: {}, warnings: [], orphanMatchCount: 0, unresolvedWorkerCount: 0 },
    };
    const warnings = buildWorkerWarnings(profile, { profiles: [profile], relationships: [] }, [], [storyline], snapshot, "2026-08-01");
    expect(warnings.map((warning) => warning.category)).toEqual(expect.arrayContaining(["Booking", "Arc", "Duplicate"]));
  });

  test("persists profiles arcs and relationships", () => {
    const storage = new MemoryStorage();
    const first = createWorkerProfile(1);
    const second = createWorkerProfile(2);
    first.arcs = [createWorkerArc(1)];
    const relationship = createWorkerRelationship(first.id, second.id);
    const universe = { profiles: [first, second], relationships: [relationship] };
    saveWorkerUniverse(storage, universe);
    expect(loadWorkerUniverse(storage)).toEqual(universe);
  });
});
