import { describe, expect, test } from "vitest";
import { emptyChampionshipUniverse } from "../src/championships/storage";
import { createBookingIdea } from "../src/control/model";
import { emptyCompetitionUniverse } from "../src/competitions/model";
import { emptyShowOperationsUniverse } from "../src/operations/model";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";
import {
  addSeriesExclusion,
  applySeriesGeneration,
  buildBookingObligations,
  createContinuityDecision,
  createShowSeries,
  createShowSeriesTemplate,
  deleteSeriesKeepShows,
  emptyPromotionScheduleUniverse,
  ensureScheduleLinks,
  migrateShowsToPromotionSchedule,
  monthCalendarDays,
  previewSeriesGeneration,
  previewSeriesRegeneration,
  rescheduleShow,
  upsertContinuityDecision,
} from "../src/schedule/model";
import { parsePromotionScheduleUniverse } from "../src/schedule/storage";
import { createStorylineMilestone, createTrackerStoryline } from "../src/storylines/model";
import { emptyWorkerUniverse } from "../src/workers/storage";

describe("Phase 5H promotion calendar", () => {
  test("generates a weekly 60-minute series with episode numbers and structural placeholders", () => {
    const template = createShowSeriesTemplate(1, true);
    const series = {
      ...createShowSeries(1),
      name: "PWL Power Hour",
      company: "PWL",
      startDate: "2026-08-03",
      defaultDayOfWeek: 1,
      templateId: template.id,
      namingPattern: "{series} #{episode}",
    };
    const universe = { ...emptyPromotionScheduleUniverse(), series: [series], templates: [template] };
    const preview = previewSeriesGeneration(series, universe, [], { mode: "count", count: 4, throughDate: "" });

    expect(preview.map((item) => item.date)).toEqual(["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"]);
    expect(preview.map((item) => item.showName)).toEqual(["PWL Power Hour #1", "PWL Power Hour #2", "PWL Power Hour #3", "PWL Power Hour #4"]);
    expect(preview.every((item) => item.status === "New")).toBe(true);

    const result = applySeriesGeneration(series, universe, [], preview, { mode: "count", count: 4, throughDate: "" });
    expect(result.shows).toHaveLength(4);
    expect(result.universe.links.map((link) => link.episodeNumber)).toEqual([1, 2, 3, 4]);
    expect(result.shows[0]).toMatchObject({ name: "PWL Power Hour #1", company: "PWL", expectedMinutes: 60, showType: "Television" });
    expect(result.shows[0].segments).toHaveLength(5);
    expect(result.shows[0].segments.reduce((total, segment) => total + segment.durationMinutes, 0)).toBe(60);
    expect(result.shows[0].segments.every((segment) => !segment.plannedWinner && !segment.plannedFinish && segment.workers.length === 0)).toBe(true);
  });

  test("supports excluded dates and blocks date conflicts from automatic creation", () => {
    const series = { ...createShowSeries(1), name: "PWL Power Hour", startDate: "2026-08-03", defaultDayOfWeek: 1 };
    const existing = createPlannedShow(1);
    existing.name = "PWL Summer Special";
    existing.date = "2026-08-17";
    let universe = { ...emptyPromotionScheduleUniverse(), series: [series] };
    universe = addSeriesExclusion(universe, series.id, "2026-08-10", "Premium event week");

    const preview = previewSeriesGeneration(series, universe, [existing], { mode: "count", count: 3, throughDate: "" });
    expect(preview.find((item) => item.date === "2026-08-10")?.status).toBe("Excluded");
    expect(preview.find((item) => item.date === "2026-08-17")?.status).toBe("Conflict");

    const result = applySeriesGeneration(series, universe, [existing], preview, { mode: "count", count: 3, throughDate: "" });
    expect(result.shows.filter((show) => show.name.startsWith("PWL Power Hour"))).toHaveLength(2);
    expect(result.session.skippedDates).toContain("2026-08-10");
    expect(result.session.conflicts[0]).toContain("2026-08-17");
  });

  test("handles monthly recurrence without date drift at the end of a month", () => {
    const series = { ...createShowSeries(1), recurrence: "Monthly" as const, startDate: "2026-01-31", namingPattern: "Monthly Event {episode}" };
    const universe = { ...emptyPromotionScheduleUniverse(), series: [series] };
    const preview = previewSeriesGeneration(series, universe, [], { mode: "count", count: 4, throughDate: "" });
    expect(preview.map((item) => item.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-28", "2026-04-28"]);
  });

  test("identifies manual edits during regeneration and never overwrites them", () => {
    const series = { ...createShowSeries(1), name: "PWL Power Hour", startDate: "2026-08-03", defaultDayOfWeek: 1 };
    const universe = { ...emptyPromotionScheduleUniverse(), series: [series] };
    const preview = previewSeriesGeneration(series, universe, [], { mode: "count", count: 1, throughDate: "" });
    const generated = applySeriesGeneration(series, universe, [], preview, { mode: "count", count: 1, throughDate: "" });
    const editedShow = { ...generated.shows[0], name: "PWL Power Hour — Special Edition" };
    const inspection = previewSeriesRegeneration(series, generated.universe, [editedShow]);
    expect(inspection[0]).toMatchObject({ status: "Manually Edited", existingShowId: editedShow.id });
    expect(inspection[0].reason).toContain("will not be overwritten");
  });

  test("deleting a series preserves its planned shows as one-off records", () => {
    const series = createShowSeries(1);
    const show = createPlannedShow(1);
    const universe = ensureScheduleLinks([show], { ...emptyPromotionScheduleUniverse(), series: [series] });
    const linked = {
      ...universe,
      links: universe.links.map((link) => ({ ...link, seriesId: series.id, episodeNumber: 1 })),
    };
    const next = deleteSeriesKeepShows(linked, series.id);
    expect(next.series).toHaveLength(0);
    expect(next.links[0]).toMatchObject({ showId: show.id, seriesId: "", episodeNumber: 0 });
  });

  test("rescheduling preserves the original date and refuses to rewrite reconciled history", () => {
    const show = createPlannedShow(1);
    show.date = "2026-08-03";
    const universe = migrateShowsToPromotionSchedule([show]);
    const result = rescheduleShow(universe, [show], show.id, "2026-08-05", "Arena conflict");
    expect(result.shows[0].date).toBe("2026-08-05");
    expect(result.universe.exceptions[0]).toMatchObject({ type: "Rescheduled", originalDate: "2026-08-03", newDate: "2026-08-05" });

    const reconciled = { ...show, status: "Reconciled" as const };
    expect(rescheduleShow(universe, [reconciled], reconciled.id, "2026-08-06", "Should fail").shows[0].date).toBe("2026-08-03");
  });

  test("builds grounded continuity obligations and remembers explicit decisions", () => {
    const previous = createPlannedShow(1);
    previous.name = "PWL Power Hour #1";
    previous.date = "2026-08-03";
    previous.status = "Reconciled";
    const angle = createPlannedSegment("angle");
    angle.title = "Champion Confrontation";
    angle.followUp = "Book a contract signing next week.";
    previous.segments = [angle];

    const target = createPlannedShow(2);
    target.name = "PWL Power Hour #2";
    target.date = "2026-08-10";

    const storyline = createTrackerStoryline(1);
    storyline.name = "World Title Rivalry";
    const milestone = createStorylineMilestone(1);
    milestone.title = "Contract Signing";
    milestone.targetDate = "2026-08-10";
    storyline.milestones = [milestone];

    const idea = createBookingIdea(1);
    idea.title = "Post-Match Attack";
    idea.status = "Ready";
    idea.targetShowId = target.id;

    const input = {
      targetShow: target,
      shows: [previous, target],
      storylines: [storyline],
      workers: emptyWorkerUniverse(),
      ideas: [idea],
      championships: emptyChampionshipUniverse(),
      competitions: emptyCompetitionUniverse(),
      operations: emptyShowOperationsUniverse(),
    };
    const obligations = buildBookingObligations({ ...input, decisions: [] });
    expect(obligations.map((obligation) => obligation.kind)).toEqual(expect.arrayContaining(["Follow-up", "Storyline Milestone", "Booking Idea"]));

    const followUp = obligations.find((obligation) => obligation.kind === "Follow-up")!;
    const universe = upsertContinuityDecision(emptyPromotionScheduleUniverse(), createContinuityDecision(followUp.key, target.id, "Addressed", target.id, "", "Handled off screen"));
    const filtered = buildBookingObligations({ ...input, decisions: universe.continuityDecisions });
    expect(filtered.some((obligation) => obligation.key === followUp.key)).toBe(false);
  });

  test("creates a timezone-stable 42-day month grid and parses persisted data safely", () => {
    const days = monthCalendarDays("2026-08");
    expect(days).toHaveLength(42);
    expect(days[0].date).toBe("2026-07-26");
    expect(days.filter((day) => day.inMonth)).toHaveLength(31);

    const parsed = parsePromotionScheduleUniverse({
      series: [{ ...createShowSeries(1), recurrence: "Weekly" }],
      templates: [],
      links: [],
      exclusions: [],
      exceptions: [],
      generationSessions: [],
      continuityDecisions: [],
      settings: { activeView: "series", month: "2026-08", listFilter: "All" },
    });
    expect(parsed.settings).toMatchObject({ activeView: "series", month: "2026-08", listFilter: "All" });
    expect(parsed.series[0].recurrence).toBe("Weekly");
  });
});
