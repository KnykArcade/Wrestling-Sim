import { describe, expect, test } from "vitest";
import {
  buildControlWarnings,
  buildCreativeCalendar,
  buildShowReadiness,
  convertIdeaToSegment,
  createBookingIdea,
  globalSearch,
  ideaIsScheduled,
  scheduleIdea,
} from "../src/control/model";
import { emptyCreativeControlData, parseCreativeControlData } from "../src/control/storage";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";
import { createStorylineMilestone, createTrackerStoryline } from "../src/storylines/model";
import type { WorkerUniverse } from "../src/workers/types";

const emptyWorkers: WorkerUniverse = { profiles: [], relationships: [] };

describe("Creative Control Center", () => {
  test("creates ideas and converts their full creative plan into a show segment", () => {
    const idea = createBookingIdea(1);
    idea.title = "Champion accepts the challenge";
    idea.type = "Promo";
    idea.concept = "The champion accepts after the challenger questions his courage.";
    idea.creativePurpose = "Confirm the title match.";
    idea.plannedConsequences = "The rivalry becomes official.";
    idea.followUp = "Contract signing next week.";
    idea.championship = "World Championship";
    idea.workers = [{ id: "worker-1", name: "Champion", role: "Champion" }];
    idea.storylines = [{ id: "story-1", name: "World Title Rivalry" }];

    const segment = convertIdeaToSegment(idea);
    expect(segment.type).toBe("angle");
    expect(segment.title).toBe(idea.title);
    expect(segment.segmentOutput).toContain("accepts");
    expect(segment.purpose).toBe(idea.creativePurpose);
    expect(segment.consequences).toBe(idea.plannedConsequences);
    expect(segment.followUp).toBe(idea.followUp);
    expect(segment.workers[0].name).toBe("Champion");
    expect(segment.storylines[0].name).toBe("World Title Rivalry");
    expect(segment.bookingIdeaId).toBe(idea.id);
  });

  test("schedules an idea exactly once and protects against duplicate card placement", () => {
    const show = createPlannedShow(1);
    show.id = "show-1";
    const idea = createBookingIdea(1);
    idea.title = "Main event challenge";
    idea.targetShowId = show.id;
    const result = scheduleIdea(idea, [show]);

    expect(result.shows[0].segments).toHaveLength(1);
    expect(result.idea.status).toBe("Scheduled");
    expect(result.idea.scheduledSegmentId).toBe(result.segment.id);
    expect(ideaIsScheduled(result.idea, result.shows)).toBe(true);
    expect(() => scheduleIdea(result.idea, result.shows)).toThrow("already scheduled");
  });

  test("calculates show readiness from time, narratives, workers, ideas, and milestones", () => {
    const show = createPlannedShow(1);
    show.id = "show-1";
    show.expectedMinutes = 60;
    const segment = createPlannedSegment("match");
    segment.title = "Unfinished Match";
    show.segments = [segment];

    const idea = createBookingIdea(1);
    idea.title = "Unscheduled Reveal";
    idea.targetShowId = show.id;
    const storyline = createTrackerStoryline(1);
    storyline.name = "Mystery Rival";
    const milestone = createStorylineMilestone(1);
    milestone.title = "Reveal the rival";
    milestone.assignedShowId = show.id;
    milestone.status = "Assigned";
    storyline.milestones = [milestone];

    const readiness = buildShowReadiness(show, [idea], [storyline]);
    expect(readiness.bookedMinutes).toBe(12);
    expect(readiness.score).toBeLessThan(100);
    expect(readiness.issues.map((issue) => issue.category)).toEqual(expect.arrayContaining(["Time", "Narrative", "Worker", "Idea", "Milestone"]));
  });

  test("combines shows, milestones, arcs, and ideas in chronological calendar order", () => {
    const show = createPlannedShow(1);
    show.id = "show-1";
    show.date = "2026-08-20";
    const storyline = createTrackerStoryline(1);
    const milestone = createStorylineMilestone(1);
    milestone.targetDate = "2026-08-10";
    storyline.milestones = [milestone];
    const idea = createBookingIdea(1);
    idea.targetDate = "2026-08-05";
    const workers: WorkerUniverse = {
      profiles: [{
        id: "worker-1", displayName: "Worker One", source: "manual", linkedTewWorkerId: "", linkedTewWorkerName: "", currentRole: "Wrestler", alignment: "Face", brand: "", gimmickSummary: "", currentMotivation: "", longTermObjective: "", creativeDirection: "", privateNotes: "", inactivityWarningDays: 30,
        arcs: [{ id: "arc-1", name: "Rise to the top", status: "Active", startingSituation: "", motivation: "", internalConflict: "", externalConflict: "", turningPoint: "", plannedResolution: "", aftermath: "", linkedStorylineId: "", targetShowId: "", targetDate: "2026-08-15", createdAt: "", updatedAt: "" }], createdAt: "", updatedAt: "",
      }], relationships: [],
    };

    const calendar = buildCreativeCalendar([show], [storyline], workers, [idea]);
    expect(calendar.map((entry) => entry.type)).toEqual(["Idea", "Milestone", "Arc", "Show"]);
  });

  test("detects cross-system continuity problems without changing records", () => {
    const storyline = createTrackerStoryline(1);
    storyline.name = "Active Rivalry";
    storyline.status = "Active";
    const idea = createBookingIdea(1);
    idea.title = "Future title change";
    idea.type = "Title Change";
    const warnings = buildControlWarnings([], [storyline], emptyWorkers, [idea]);
    expect(warnings.some((warning) => warning.category === "Storyline")).toBe(true);
    expect(warnings.some((warning) => warning.category === "Championship")).toBe(true);
  });

  test("searches across shows, segments, storylines, workers, relationships, and ideas", () => {
    const show = createPlannedShow(1);
    show.name = "Summer Spectacular";
    const segment = createPlannedSegment("angle");
    segment.segmentOutput = "A masked rival attacks the champion.";
    show.segments = [segment];
    const storyline = createTrackerStoryline(1);
    storyline.name = "Masked Rival";
    const idea = createBookingIdea(1);
    idea.title = "Mask reveal";

    expect(globalSearch("masked", [show], [storyline], emptyWorkers, [idea]).map((result) => result.kind)).toEqual(expect.arrayContaining(["Segment", "Storyline"]));
    expect(globalSearch("reveal", [show], [storyline], emptyWorkers, [idea]).some((result) => result.kind === "Booking Idea")).toBe(true);
  });

  test("persists normalized control data and safely supplies defaults", () => {
    const empty = emptyCreativeControlData();
    expect(empty.ideas).toEqual([]);
    const parsed = parseCreativeControlData({
      ideas: [{ id: "idea-1", title: "Return", type: "Return", status: "Ready", priority: "High" }],
      settings: { dashboardWindowDays: 60, calendarFilter: "Ideas", searchQuery: "return" },
    });
    expect(parsed.ideas[0]).toMatchObject({ title: "Return", type: "Return", status: "Ready", priority: "High" });
    expect(parsed.settings).toEqual({ dashboardWindowDays: 60, calendarFilter: "Ideas", searchQuery: "return" });
  });
});
