import { describe, expect, test } from "vitest";
import { emptyMatchEngineUniverse } from "../src/matchEngine/storage";
import { createPlannedShow } from "../src/planner/model";
import type { TewSnapshot } from "../src/tew/types";
import {
  BUILT_IN_WORKBENCH_TEMPLATES,
  attachQuickSegmentToShow,
  captureWorkbenchDraft,
  createQuickSegmentRecord,
  duplicateWorkbenchDraft,
  restoreWorkbenchDraft,
  synchronizeWorkerRatingSources,
  tewNotesOutput,
} from "../src/workbench/model";
import { emptyWorkbenchUniverse } from "../src/workbench/model";
import { parseWorkbenchUniverse } from "../src/workbench/storage";

describe("Phase 5D Match and Angle Workbench", () => {
  test("provides reusable structures without prebooking wrestlers or winners", () => {
    expect(BUILT_IN_WORKBENCH_TEMPLATES.map((template) => template.name)).toEqual(expect.arrayContaining([
      "Television Opening Promo",
      "Post-Match Confrontation",
      "Squash Match",
      "Technical Showcase",
      "Heated Grudge Match",
      "Tournament Match",
      "Tag-Team Showcase",
      "Main-Event Title Match",
    ]));
    const template = BUILT_IN_WORKBENCH_TEMPLATES.find((item) => item.id === "technical-showcase")!;
    const record = createQuickSegmentRecord("match", template);
    expect(record.segment).toMatchObject({
      title: "Technical Showcase",
      durationMinutes: 18,
      plannedWinner: "",
      workers: [],
      matchApproachSetup: { matchAimId: "technical-showcase" },
    });
  });

  test("saves restores and duplicates output revisions", () => {
    let record = createQuickSegmentRecord("match");
    record.segment.title = "Jay White vs PAC";
    record.segment.matchStory = "PAC controls the opening before White creates the decisive mistake.";
    record.segment.keyMoments = "Opening: PAC controls pace.\nFinish: Blade Runner.";
    record = captureWorkbenchDraft(record, "sports", "standard", "First pass");
    expect(record.draftHistory).toHaveLength(1);
    expect(record.draftHistory[0].tewNotes).toContain("Jay White vs PAC");

    record.segment.matchStory = "Changed output";
    const restored = restoreWorkbenchDraft(record, record.draftHistory[0]);
    expect(restored.segment.matchStory).toContain("PAC controls the opening");

    const duplicate = duplicateWorkbenchDraft(restored, restored.draftHistory[0]);
    expect(duplicate.id).not.toBe(restored.id);
    expect(duplicate.segment.title).toBe("Jay White vs PAC Copy");
    expect(duplicate.attachedShowIds).toEqual([]);
  });

  test("attaches a linked copy to a planned show while preserving the standalone draft", () => {
    const show = createPlannedShow(1);
    const record = createQuickSegmentRecord("angle", BUILT_IN_WORKBENCH_TEMPLATES.find((item) => item.id === "post-match-confrontation"));
    const result = attachQuickSegmentToShow(record, show.id, [show]);
    expect(result.shows[0].segments).toHaveLength(1);
    expect(result.shows[0].segments[0].id).not.toBe(record.segment.id);
    expect(result.shows[0].segments[0].title).toBe("Post-Match Confrontation");
    expect(record.attachedShowIds).toEqual([]);
    expect(result.record.attachedShowIds).toEqual([show.id]);
  });

  test("labels unsupported TEW rating values as missing rather than guessing", () => {
    const snapshot: TewSnapshot = {
      fileName: "TEW9-copy.mdb",
      fileSize: 100,
      databaseCreatedAt: "",
      importedAt: "2026-08-01T00:00:00.000Z",
      tables: [],
      workers: [{ id: "worker-1", name: "Jay White", role: "", side: "" }],
      shows: [],
      storylines: [],
      diagnostics: { matchedTables: {}, warnings: [], orphanMatchCount: 0, unresolvedWorkerCount: 0 },
    };
    const [source] = synchronizeWorkerRatingSources(snapshot, emptyMatchEngineUniverse(), []);
    expect(source.identitySource).toBe("TEW snapshot");
    expect(source.overall.source).toBe("Missing");
    expect(source.overall.note).toContain("not a verified value");
  });

  test("normalizes saved workbench data and keeps built-in templates", () => {
    const empty = emptyWorkbenchUniverse();
    const parsed = parseWorkbenchUniverse({ ...empty, templates: [], quickSegments: [] });
    expect(parsed.templates.length).toBe(BUILT_IN_WORKBENCH_TEMPLATES.length);
    expect(tewNotesOutput(createQuickSegmentRecord("angle").segment)).toContain("Untitled Angle");
  });
});
