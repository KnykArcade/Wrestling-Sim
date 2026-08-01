import { describe, expect, test } from "vitest";
import {
  buildHandoffWarnings,
  buildSegmentEntryText,
  buildShowHandoffMarkdown,
  buildShowHandoffText,
  collectMappingTargets,
  createEmptyHandoffUniverse,
  createShowHandoffRecord,
  finalizeHandoffVersion,
  handoffProgress,
  synchronizeSegmentProgress,
  upsertMapping,
} from "../src/handoff/model";
import { HANDOFF_STORAGE_KEY, loadHandoffUniverse, saveHandoffUniverse } from "../src/handoff/storage";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";
import type { TewSnapshot } from "../src/tew/types";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function plannedShow() {
  const show = createPlannedShow(1);
  show.name = "PWL Saturday Night";
  show.company = "PWL";
  show.venue = "Cleveland Arena";
  show.expectedMinutes = 60;
  const match = createPlannedSegment("match");
  match.title = "PWL Championship Match";
  match.durationMinutes = 20;
  match.workers = [
    { id: "bret", name: "Bret Hart", role: "Competitor", side: "Side 1", source: "manual" },
    { id: "shawn", name: "Shawn Michaels", role: "Competitor", side: "Side 2", source: "manual" },
  ];
  match.storylines = [{ id: "rivalry", name: "World Title Rivalry", source: "manual" }];
  match.matchType = "1 vs. 1";
  match.championship = "PWL Championship";
  match.championshipId = "pwl-title";
  match.championshipMatchPurpose = "Defense";
  match.championEntering = "Bret Hart";
  match.challenger = "Shawn Michaels";
  match.expectedTitleChange = false;
  match.championshipStakes = "Bret's first defense.";
  match.plannedWinner = "Bret Hart";
  match.plannedFinish = "Submission";
  match.matchStory = "Bret controls the knee and wins with the Sharpshooter.";
  match.privateNotes = "Protect Shawn in defeat.";
  const angle = createPlannedSegment("angle");
  angle.title = "Post-Match Respect";
  angle.durationMinutes = 5;
  angle.workers = [{ id: "bret", name: "Bret Hart", role: "Champion", side: "", source: "manual" }];
  angle.segmentOutput = "Bret offers a handshake after the bell.";
  show.segments = [match, angle];
  return show;
}

const snapshot: TewSnapshot = {
  fileName: "TEW9.mdb",
  fileSize: 100,
  databaseCreatedAt: "",
  importedAt: "2026-08-01T12:00:00.000Z",
  tables: [],
  workers: [
    { id: "tew-bret", name: "Bret Hart", role: "Wrestler", side: "" },
    { id: "tew-shawn", name: "Shawn Michaels", role: "Wrestler", side: "" },
  ],
  shows: [],
  storylines: [{ id: "tew-rivalry", name: "World Title Rivalry", description: "", status: "Active", heat: 80, workers: [], sourceTable: "tblStorylines" }],
  diagnostics: { matchedTables: {}, warnings: [], orphanMatchCount: 0, unresolvedWorkerCount: 0 },
};

describe("TEW handoff package", () => {
  test("freezes a complete version and reports later card changes", () => {
    const show = plannedShow();
    const first = finalizeHandoffVersion(show, null);
    expect(first.versionNumber).toBe(1);
    expect(first.segments).toHaveLength(2);
    expect(first.segments[0].plannedWinner).toBe("Bret Hart");
    expect(first.changesFromPrevious).toContain("Initial finalized handoff package.");

    show.segments[0].plannedWinner = "Shawn Michaels";
    show.segments[0].durationMinutes = 25;
    show.updatedAt = "2026-08-02T00:00:00.000Z";
    const second = finalizeHandoffVersion(show, first);
    expect(second.versionNumber).toBe(2);
    expect(second.changesFromPrevious.some((change) => change.includes("planned winner changed"))).toBe(true);
    expect(second.changesFromPrevious.some((change) => change.includes("duration changed"))).toBe(true);
    expect(first.segments[0].plannedWinner).toBe("Bret Hart");
  });

  test("builds copy-ready text and markdown with mappings", () => {
    const version = finalizeHandoffVersion(plannedShow(), null);
    let mappings = upsertMapping([], { kind: "Championship", trackerId: "pwl-title", trackerName: "PWL Championship", tewId: "", tewName: "PWL World Championship" });
    mappings = upsertMapping(mappings, { kind: "Company", trackerId: "PWL", trackerName: "PWL", tewId: "", tewName: "Pro Wrestling League" });
    const segmentText = buildSegmentEntryText(version.segments[0], mappings);
    const showText = buildShowHandoffText(version, mappings);
    const markdown = buildShowHandoffMarkdown(version, mappings);
    expect(segmentText).toContain("PWL World Championship");
    expect(segmentText).toContain("Planned winner: Bret Hart");
    expect(showText).toContain("Company: Pro Wrestling League");
    expect(markdown).toContain("# PWL Saturday Night");
    expect(markdown).toContain("Match Story");
  });

  test("detects missing mappings and clears them when records are mapped", () => {
    const version = finalizeHandoffVersion(plannedShow(), null);
    const initial = buildHandoffWarnings(version, snapshot, []);
    expect(initial.some((warning) => warning.message.includes("PWL has no saved TEW company mapping"))).toBe(true);
    expect(initial.some((warning) => warning.message.includes("PWL Championship has no saved TEW championship mapping"))).toBe(true);
    expect(initial.some((warning) => warning.message.includes("Bret Hart cannot be matched"))).toBe(false);

    let mappings = upsertMapping([], { kind: "Company", trackerId: "PWL", trackerName: "PWL", tewId: "", tewName: "PWL" });
    mappings = upsertMapping(mappings, { kind: "Championship", trackerId: "pwl-title", trackerName: "PWL Championship", tewId: "", tewName: "PWL Championship" });
    const resolved = buildHandoffWarnings(version, snapshot, mappings);
    expect(resolved.some((warning) => warning.category === "Mapping")).toBe(false);
  });

  test("tracks segment entry progress and reusable mapping targets", () => {
    const version = finalizeHandoffVersion(plannedShow(), null);
    const record = createShowHandoffRecord(version.show.id);
    record.activeVersionId = version.id;
    record.versions = [version];
    record.segmentProgress = synchronizeSegmentProgress(version, []);
    record.segmentProgress[0].completed = true;
    expect(handoffProgress(record, version)).toEqual({ completed: 1, total: 2 });
    const targets = collectMappingTargets(version);
    expect(targets.some((target) => target.kind === "Worker" && target.trackerName === "Bret Hart")).toBe(true);
    expect(targets.some((target) => target.kind === "Championship" && target.trackerName === "PWL Championship")).toBe(true);
    expect(targets.filter((target) => target.kind === "Worker" && target.trackerName === "Bret Hart")).toHaveLength(1);
  });

  test("persists and safely recovers the handoff universe", () => {
    const storage = new MemoryStorage();
    const universe = createEmptyHandoffUniverse();
    universe.records.push(createShowHandoffRecord("show-1"));
    universe.mappings = upsertMapping(universe.mappings, { kind: "Worker", trackerId: "bret", trackerName: "Bret Hart", tewId: "tew-bret", tewName: "Bret Hart" });
    saveHandoffUniverse(storage, universe);
    expect(loadHandoffUniverse(storage)).toEqual(universe);
    storage.setItem(HANDOFF_STORAGE_KEY, "not-json");
    expect(loadHandoffUniverse(storage)).toEqual({ records: [], mappings: [] });
  });
});
