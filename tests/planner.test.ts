import { describe, expect, test } from "vitest";
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

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("planned show workspace", () => {
  test("creates rich match and angle defaults and calculates card time", () => {
    const show = createPlannedShow(1);
    const match = createPlannedSegment("match");
    const angle = createPlannedSegment("angle");
    show.segments = [match, angle];
    expect(show.name).toBe("Untitled Show 1");
    expect(show.reconciliation).toBeNull();
    expect(match).toMatchObject({ title: "Untitled Match", matchType: "1 vs. 1", matchStory: "", workers: [], storylines: [], workflowStatus: "Planned" });
    expect(match.reconciliation.actualMatch).toBeNull();
    expect(angle).toMatchObject({ title: "Untitled Angle", angleLocation: "In The Ring", angleContentType: "Serious", segmentOutput: "", workflowStatus: "Planned" });
    expect(totalPlannedMinutes(show)).toBe(17);
  });

  test("builds a copy-ready TEW summary", () => {
    const match = createPlannedSegment("match");
    match.title = "World Title Match";
    match.plannedWinner = "Bret Hart";
    match.plannedFinish = "Submission";
    match.matchStory = "Bret targets the knee and wins with the Sharpshooter.";
    match.workers = [{ id: "1", name: "Bret Hart", role: "Competitor", side: "Side 1", source: "tew" }];
    const summary = buildTewEntrySummary(match);
    expect(summary).toContain("World Title Match");
    expect(summary).toContain("Planned winner: Bret Hart");
    expect(summary).toContain("Bret targets the knee");
  });

  test("moves segments without allowing them outside the card", () => {
    const first = createPlannedSegment("angle");
    const second = createPlannedSegment("match");
    const original = [first, second];
    expect(movePlannedSegment(original, second.id, -1).map((item) => item.id)).toEqual([second.id, first.id]);
    expect(movePlannedSegment(original, first.id, -1)).toBe(original);
  });

  test("duplicates shows and nested narrative identifiers without actual results", () => {
    const show = createPlannedShow(1);
    const match = createPlannedSegment("match");
    match.workers = [{ id: "worker-1", name: "Worker One", role: "Competitor", side: "Side 1", source: "tew" }];
    match.workflowStatus = "Reconciled";
    match.reconciliation.linkedMatchId = "actual-1";
    show.reconciliation = {
      linkedShowId: "show-actual",
      actualShow: { id: "show-actual", name: "Actual Show", date: "2026-08-01", rating: 80, attendance: 10000, venue: "Arena", company: "WWE", broadcast: "Network", sourceFile: "TEW9.mdb" },
      linkedAt: "2026-08-01T01:00:00.000Z",
      completedAt: "2026-08-01T02:00:00.000Z",
      notes: "",
    };
    show.segments = [match, createPlannedSegment("angle")];
    const duplicate = duplicatePlannedShow(show);
    expect(duplicate.id).not.toBe(show.id);
    expect(duplicate.name).toBe(`${show.name} Copy`);
    expect(duplicate.reconciliation).toBeNull();
    expect(duplicate.segments.map((item) => item.id)).not.toEqual(show.segments.map((item) => item.id));
    expect(duplicate.segments[0].workers[0].id).not.toBe(match.workers[0].id);
    expect(duplicate.segments[0].workflowStatus).toBe("Planned");
    expect(duplicate.segments[0].reconciliation.actualMatch).toBeNull();
  });

  test("saves, loads, exports, and imports Phase 3B data", () => {
    const storage = new MemoryStorage();
    const show = createPlannedShow(1);
    const match = createPlannedSegment("match");
    match.matchStory = "A complete match story.";
    show.segments = [match];
    savePlannedShows(storage, [show]);
    expect(loadPlannedShows(storage)).toEqual([show]);
    const workers = { profiles: [], relationships: [] };
    const backup = createPlannerBackup([show], [], workers);
    expect(backup.version).toBe(5);
    expect(backup.storylines).toEqual([]);
    expect(backup.workers).toEqual(workers);
    expect(parsePlannerBackup(JSON.stringify(backup))).toEqual([show]);
    expect(parsePlannerBackupBundle(JSON.stringify(backup))).toEqual({ shows: [show], storylines: [], workers });
  });

  test("migrates Phase 2A planned shows without losing the card", () => {
    const storage = new MemoryStorage();
    storage.setItem(PLANNER_STORAGE_KEY, JSON.stringify([{ id: "show-1", name: "Legacy Planned Show", date: "2026-08-01", company: "AEW", showType: "Television", venue: "Arena", expectedMinutes: 120, status: "Draft", notes: "Legacy notes", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", segments: [{ id: "segment-1", type: "angle", section: "Main Show", title: "Opening Promo", durationMinutes: 5, notes: "Basic outline" }] }]));
    const [show] = loadPlannedShows(storage);
    expect(show.name).toBe("Legacy Planned Show");
    expect(show.reconciliation).toBeNull();
    expect(show.segments[0]).toMatchObject({ title: "Opening Promo", segmentOutput: "", workers: [], storylines: [], workflowStatus: "Planned" });
    expect(show.segments[0].reconciliation.actualMatch).toBeNull();
  });

  test("accepts older versioned backups and rejects future unsupported versions", () => {
    expect(parsePlannerBackup('{"product":"TEW IX Story Tracker","version":1,"shows":[]}')).toEqual([]);
    expect(parsePlannerBackup('{"product":"TEW IX Story Tracker","version":2,"shows":[]}')).toEqual([]);
    expect(parsePlannerBackup('{"product":"TEW IX Story Tracker","version":3,"shows":[]}')).toEqual([]);
    expect(parsePlannerBackup('{"product":"TEW IX Story Tracker","version":4,"shows":[],"storylines":[]}')).toEqual([]);
    expect(() => parsePlannerBackup('{"product":"TEW IX Story Tracker","version":6,"shows":[]}')).toThrow("not a supported TEW Story Tracker backup");
  });
});
