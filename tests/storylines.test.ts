import { describe, expect, test } from "vitest";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";
import {
  buildContinuityWarnings,
  buildStorylineTimeline,
  collectStorylineReferences,
  createStorylineMilestone,
  createTrackerStoryline,
  duplicateTrackerStoryline,
  syncKnownSegmentIds,
} from "../src/storylines/model";
import {
  STORYLINE_STORAGE_KEY,
  loadTrackerStorylines,
  saveTrackerStorylines,
} from "../src/storylines/storage";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("storyline universe", () => {
  test("creates and duplicates complete storyline records", () => {
    const storyline = createTrackerStoryline(1);
    storyline.name = "World Title Rivalry";
    storyline.participants = [{ id: "worker-1", name: "Bret Hart", role: "Protagonist", source: "manual" }];
    storyline.milestones = [createStorylineMilestone(1)];

    const duplicate = duplicateTrackerStoryline(storyline);
    expect(storyline.status).toBe("Idea");
    expect(duplicate.id).not.toBe(storyline.id);
    expect(duplicate.name).toBe("World Title Rivalry Copy");
    expect(duplicate.participants[0].id).not.toBe(storyline.participants[0].id);
    expect(duplicate.milestones[0].status).toBe("Unassigned");
  });

  test("builds chronological planned and reconciled timeline entries", () => {
    const storyline = createTrackerStoryline(1);
    storyline.name = "World Title Rivalry";

    const firstShow = createPlannedShow(1);
    firstShow.id = "show-1";
    firstShow.name = "Week One";
    firstShow.date = "2026-08-01";
    const angle = createPlannedSegment("angle");
    angle.id = "angle-1";
    angle.title = "Opening Challenge";
    angle.segmentOutput = "The challenger demands a title match.";
    angle.storylines = [{ id: "manual-story", name: "World Title Rivalry", source: "manual" }];
    angle.workers = [{ id: "worker-1", name: "Bret Hart", role: "Speaker", side: "", source: "manual" }];
    firstShow.segments = [angle];

    const secondShow = createPlannedShow(2);
    secondShow.id = "show-2";
    secondShow.name = "Week Two";
    secondShow.date = "2026-08-08";
    const match = createPlannedSegment("match");
    match.id = "match-1";
    match.title = "World Title Match";
    match.matchStory = "The champion survives the challenger.";
    match.storylines = [{ id: "tew-story", name: "Imported Rivalry", source: "tew" }];
    match.workflowStatus = "Reconciled";
    match.reconciliation.actualMatch = {
      id: "actual-match",
      description: "Bret defeated Shawn",
      rating: 88,
      winner: "Bret Hart",
      matchTime: "24:03",
      notes: "Excellent chemistry",
      placement: "Main Show",
      workers: ["Bret Hart", "Shawn Michaels"],
    };
    match.reconciliation.finalNarrative = "The champion won after surviving interference.";
    match.reconciliation.actualConsequences = "A rematch is demanded.";
    match.reconciliation.finalFollowUp = "Contract signing next week.";
    secondShow.segments = [match];

    storyline.referenceLinks = [{ id: "link-1", source: "tew", referenceId: "tew-story", name: "Imported Rivalry" }];

    const timeline = buildStorylineTimeline(storyline, [secondShow, firstShow]);
    expect(timeline.map((entry) => entry.segmentId)).toEqual(["angle-1", "match-1"]);
    expect(timeline[1]).toMatchObject({ rating: 88, reconciled: true, finalNarrative: "The champion won after surviving interference." });
    expect(timeline[1].actualSummary).toContain("Winner: Bret Hart");
  });

  test("collects references and reports continuity issues", () => {
    const storyline = createTrackerStoryline(1);
    storyline.name = "Long Rivalry";
    storyline.status = "Completed";
    storyline.participants = [{ id: "missing", name: "Absent Wrestler", role: "Antagonist", source: "manual" }];
    const milestone = createStorylineMilestone(1);
    milestone.type = "Climax";
    milestone.title = "Final Match";
    milestone.targetDate = "2026-07-01";
    storyline.milestones = [milestone];
    storyline.knownSegmentIds = ["deleted-segment"];

    const show = createPlannedShow(1);
    const angle = createPlannedSegment("angle");
    angle.storylines = [{ id: "manual-ref", name: "Long Rivalry", source: "manual" }];
    angle.workers = [{ id: "present", name: "Present Wrestler", role: "Speaker", side: "", source: "manual" }];
    show.segments = [angle];

    expect(collectStorylineReferences([show])).toMatchObject([{ name: "Long Rivalry", usageCount: 1 }]);
    const timeline = buildStorylineTimeline(storyline, [show]);
    const warnings = buildContinuityWarnings(storyline, [show], timeline, new Date("2026-08-01T12:00:00Z"));
    expect(warnings.map((warning) => warning.category)).toEqual(expect.arrayContaining(["Milestone", "Participant", "Aftermath", "Broken Link", "Payoff"]));
  });

  test("persists storylines and remembers linked segment history", () => {
    const storage = new MemoryStorage();
    const storyline = createTrackerStoryline(1);
    const show = createPlannedShow(1);
    const angle = createPlannedSegment("angle");
    angle.storylines = [{ id: "reference", name: storyline.name, source: "manual" }];
    show.segments = [angle];

    const synced = syncKnownSegmentIds(storyline, buildStorylineTimeline(storyline, [show]));
    saveTrackerStorylines(storage, [synced]);
    expect(storage.getItem(STORYLINE_STORAGE_KEY)).toContain(angle.id);
    expect(loadTrackerStorylines(storage)).toEqual([synced]);
  });
});
